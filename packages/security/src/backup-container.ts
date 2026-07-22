import { createHash, hkdfSync, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '@ajnutrition/shared';
import { openEnvelope, sealEnvelope, type EnvelopeV1 } from './envelope';
import type { KeyfileV1 } from './keyfile';

/**
 * .ajnbackup container format v1 (ADR-0011).
 *
 * Layout:  MAGIC(8) ┃ headerLength(4, LE) ┃ header JSON ┃ payload ciphertext
 *
 * - The payload (a `VACUUM INTO` snapshot, itself encrypted with the DB key)
 *   is wrapped AGAIN with AES-256-GCM under a per-backup KEK derived from the
 *   master key with a fresh random salt — independent of the live DB key.
 * - The KEYFILE travels in the header: a backup + the passphrase is enough to
 *   restore on a brand-new machine. The keyfile alone is scrypt-bound; copying
 *   the backup file reveals nothing.
 * - Integrity is layered: `payloadSha256` gives a fast pre-check without any
 *   secret; the GCM tag authenticates the ciphertext; the GCM AAD binds the
 *   security-critical header fields, so editing e.g. the schema version makes
 *   decryption fail even if the hash is recomputed to match.
 * - The passphrase is NEVER stored in the container.
 */

export const BACKUP_MAGIC = Buffer.from('AJNBCKP1', 'ascii');
export const BACKUP_FORMAT_VERSION = 1;
const BACKUP_KEK_INFO = 'ajnutrition/backup-kek/v1';
const AAD_PREFIX = 'ajnutrition/backup/v1';
const MAX_HEADER_BYTES = 1024 * 1024;

const EnvelopeMetaSchema = z
  .object({
    v: z.literal(1),
    alg: z.literal('aes-256-gcm'),
    nonceB64: z.string().min(1),
    tagB64: z.string().min(1),
  })
  .strict();

const HeaderSchema = z
  .object({
    formatVersion: z.number().int().min(1),
    createdAt: z.string(),
    appVersion: z.string(),
    schemaVersion: z.number().int().min(0),
    description: z.string().max(200).nullable(),
    keyfile: z.unknown(),
    kekSaltB64: z.string().min(1),
    payloadSha256: z.string().regex(/^[0-9a-f]{64}$/),
    payloadEnvelope: EnvelopeMetaSchema,
  })
  .strict();

export interface BackupHeader {
  formatVersion: number;
  createdAt: string;
  appVersion: string;
  schemaVersion: number;
  description: string | null;
  keyfile: KeyfileV1;
  kekSaltB64: string;
  payloadSha256: string;
  payloadEnvelope: Omit<EnvelopeV1, 'ciphertextB64'>;
}

export interface BackupMeta {
  createdAt: string;
  appVersion: string;
  schemaVersion: number;
  description: string | null;
}

export function deriveBackupKek(masterKey: Buffer, salt: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', masterKey, salt, BACKUP_KEK_INFO, 32));
}

/** AAD binds the header fields that decide restore behavior. */
function backupAad(
  header: Pick<BackupHeader, 'formatVersion' | 'createdAt' | 'appVersion' | 'schemaVersion' | 'kekSaltB64'>,
): string {
  return [
    AAD_PREFIX,
    header.formatVersion,
    header.createdAt,
    header.appVersion,
    header.schemaVersion,
    header.kekSaltB64,
  ].join('|');
}

export function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function writeBackupContainer(input: {
  payload: Buffer;
  masterKey: Buffer;
  keyfile: KeyfileV1;
  meta: BackupMeta;
}): Buffer {
  const kekSalt = randomBytes(32);
  const kekSaltB64 = kekSalt.toString('base64');
  const boundFields = {
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: input.meta.createdAt,
    appVersion: input.meta.appVersion,
    schemaVersion: input.meta.schemaVersion,
    kekSaltB64,
  };

  const kek = deriveBackupKek(input.masterKey, kekSalt);
  const envelope = sealEnvelope(input.payload, kek, backupAad(boundFields));
  kek.fill(0);

  const ciphertext = Buffer.from(envelope.ciphertextB64, 'base64');
  const header: BackupHeader = {
    ...boundFields,
    description: input.meta.description,
    keyfile: input.keyfile,
    payloadSha256: sha256Hex(ciphertext),
    payloadEnvelope: {
      v: envelope.v,
      alg: envelope.alg,
      nonceB64: envelope.nonceB64,
      tagB64: envelope.tagB64,
    },
  };

  const headerJson = Buffer.from(JSON.stringify(header), 'utf8');
  const lengthPrefix = Buffer.alloc(4);
  lengthPrefix.writeUInt32LE(headerJson.length);
  return Buffer.concat([BACKUP_MAGIC, lengthPrefix, headerJson, ciphertext]);
}

export interface ParsedBackup {
  header: BackupHeader;
  ciphertext: Buffer;
}

export function readBackupContainer(file: Buffer): ParsedBackup {
  const corrupt = (detail: string): AppError =>
    new AppError({
      code: 'INTEGRITY',
      message: 'El archivo de respaldo está dañado o no es un respaldo de AJNutrition.',
      internalDetail: detail,
    });

  if (file.length < BACKUP_MAGIC.length + 4 || !file.subarray(0, 8).equals(BACKUP_MAGIC)) {
    throw corrupt('bad magic');
  }
  const headerLength = file.readUInt32LE(8);
  if (headerLength === 0 || headerLength > MAX_HEADER_BYTES || 12 + headerLength > file.length) {
    throw corrupt('bad header length');
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(file.subarray(12, 12 + headerLength).toString('utf8'));
  } catch {
    throw corrupt('header not JSON');
  }
  const result = HeaderSchema.safeParse(parsedJson);
  if (!result.success) throw corrupt('header failed schema validation');
  if (result.data.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new AppError({
      code: 'RESTORE',
      message:
        'Este respaldo fue creado por una versión más reciente de AJNutrition. Actualice la aplicación para restaurarlo.',
      internalDetail: `backup format ${result.data.formatVersion} > supported ${BACKUP_FORMAT_VERSION}`,
    });
  }
  const ciphertext = file.subarray(12 + headerLength);
  if (sha256Hex(ciphertext) !== result.data.payloadSha256) {
    throw corrupt('payload hash mismatch');
  }
  return { header: result.data as BackupHeader, ciphertext };
}

/** Decrypts and authenticates the payload. Throws ENCRYPTION on tamper or wrong master key. */
export function decryptBackupPayload(parsed: ParsedBackup, masterKey: Buffer): Buffer {
  const kek = deriveBackupKek(masterKey, Buffer.from(parsed.header.kekSaltB64, 'base64'));
  try {
    const envelope: EnvelopeV1 = {
      ...parsed.header.payloadEnvelope,
      ciphertextB64: parsed.ciphertext.toString('base64'),
    };
    return openEnvelope(envelope, kek, backupAad(parsed.header));
  } finally {
    kek.fill(0);
  }
}
