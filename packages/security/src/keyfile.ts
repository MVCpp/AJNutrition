import { hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError } from '@ajnutrition/shared';
import { openEnvelope, sealEnvelope, type EnvelopeV1 } from './envelope';
import {
  DEFAULT_SCRYPT_PARAMS,
  deriveKeyFromPassphrase,
  newKdfSalt,
  type ScryptParams,
} from './kdf';

/**
 * Key hierarchy (ADR-0006):
 *
 *   passphrase ──scrypt──▶ KEK ──unwraps──▶ master key (random 256-bit)
 *   recovery key ──HKDF──▶ RK-KEK ──unwraps──▶ master key (second slot)
 *   master key ──HKDF('ajn/db-key/v1')──▶ SQLite database key
 *
 * The master key never touches disk in the clear. Losing BOTH the passphrase
 * and the recovery key makes the data permanently unrecoverable — by design.
 */

export const MIN_PASSPHRASE_LENGTH = 12;
export const MAX_PASSPHRASE_LENGTH = 128;

const MASTER_KEY_BYTES = 32;
const RECOVERY_KEY_BYTES = 32;
const AAD_PASSPHRASE_SLOT = 'ajnutrition/keyfile/v1/passphrase-slot';
const AAD_RECOVERY_SLOT = 'ajnutrition/keyfile/v1/recovery-slot';
const DB_KEY_INFO = 'ajnutrition/db-key/v1';
const RECOVERY_KEK_INFO = 'ajnutrition/recovery-kek/v1';

export interface KeyfileV1 {
  version: 1;
  createdAt: string;
  updatedAt: string;
  kdf: ScryptParams & { saltB64: string };
  passphraseSlot: EnvelopeV1;
  recoverySlot: EnvelopeV1;
  recoverySaltB64: string;
}

export interface CreatedKeyfile {
  keyfile: KeyfileV1;
  masterKey: Buffer;
  /** Formatted for one-time display. Never persisted anywhere by the app. */
  recoveryKey: string;
}

function assertPassphrasePolicy(passphrase: string): void {
  if (
    passphrase.length < MIN_PASSPHRASE_LENGTH ||
    passphrase.length > MAX_PASSPHRASE_LENGTH
  ) {
    throw new AppError({
      code: 'VALIDATION',
      message: `La frase de acceso debe tener entre ${MIN_PASSPHRASE_LENGTH} y ${MAX_PASSPHRASE_LENGTH} caracteres.`,
      fieldErrors: { passphrase: ['passphrase_length'] },
    });
  }
}

function recoveryKek(recoveryKeyBytes: Buffer, salt: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', recoveryKeyBytes, salt, RECOVERY_KEK_INFO, 32));
}

/** 32 random bytes rendered as 8 dash-separated hex groups: easy to write down and re-enter. */
export function formatRecoveryKey(bytes: Buffer): string {
  const hex = bytes.toString('hex').toUpperCase();
  const groups: string[] = [];
  for (let i = 0; i < hex.length; i += 8) groups.push(hex.slice(i, i + 8));
  return groups.join('-');
}

export function parseRecoveryKey(formatted: string): Buffer {
  const hex = formatted.replace(/[\s-]/g, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'La clave de recuperación no tiene el formato esperado.',
      fieldErrors: { recoveryKey: ['invalid_recovery_key'] },
    });
  }
  return Buffer.from(hex, 'hex');
}

export function createKeyfile(
  passphrase: string,
  now: () => Date,
  kdfParams: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): CreatedKeyfile {
  assertPassphrasePolicy(passphrase);
  const masterKey = randomBytes(MASTER_KEY_BYTES);
  const recoveryKeyBytes = randomBytes(RECOVERY_KEY_BYTES);
  const salt = newKdfSalt();
  const recoverySalt = newKdfSalt();
  const kek = deriveKeyFromPassphrase(passphrase, salt, kdfParams);
  const nowIso = now().toISOString();

  const keyfile: KeyfileV1 = {
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    kdf: { ...kdfParams, saltB64: salt.toString('base64') },
    passphraseSlot: sealEnvelope(masterKey, kek, AAD_PASSPHRASE_SLOT),
    recoverySlot: sealEnvelope(
      masterKey,
      recoveryKek(recoveryKeyBytes, recoverySalt),
      AAD_RECOVERY_SLOT,
    ),
    recoverySaltB64: recoverySalt.toString('base64'),
  };
  kek.fill(0);
  const formatted = formatRecoveryKey(recoveryKeyBytes);
  recoveryKeyBytes.fill(0);
  return { keyfile, masterKey, recoveryKey: formatted };
}

export function unlockWithPassphrase(keyfile: KeyfileV1, passphrase: string): Buffer {
  const kek = deriveKeyFromPassphrase(
    passphrase,
    Buffer.from(keyfile.kdf.saltB64, 'base64'),
    keyfile.kdf,
  );
  try {
    return openEnvelope(keyfile.passphraseSlot, kek, AAD_PASSPHRASE_SLOT);
  } catch {
    throw new AppError({
      code: 'AUTHORIZATION',
      message: 'Frase de acceso incorrecta.',
    });
  } finally {
    kek.fill(0);
  }
}

export function unlockWithRecoveryKey(keyfile: KeyfileV1, formattedRecoveryKey: string): Buffer {
  const recoveryKeyBytes = parseRecoveryKey(formattedRecoveryKey);
  const kek = recoveryKek(recoveryKeyBytes, Buffer.from(keyfile.recoverySaltB64, 'base64'));
  recoveryKeyBytes.fill(0);
  try {
    return openEnvelope(keyfile.recoverySlot, kek, AAD_RECOVERY_SLOT);
  } catch {
    throw new AppError({
      code: 'AUTHORIZATION',
      message: 'Clave de recuperación incorrecta.',
    });
  } finally {
    kek.fill(0);
  }
}

/** Re-wraps the passphrase slot (passphrase change / post-recovery reset). */
export function rewrapPassphraseSlot(
  keyfile: KeyfileV1,
  masterKey: Buffer,
  newPassphrase: string,
  now: () => Date,
  kdfParams: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): KeyfileV1 {
  assertPassphrasePolicy(newPassphrase);
  const salt = newKdfSalt();
  const kek = deriveKeyFromPassphrase(newPassphrase, salt, kdfParams);
  const updated: KeyfileV1 = {
    ...keyfile,
    updatedAt: now().toISOString(),
    kdf: { ...kdfParams, saltB64: salt.toString('base64') },
    passphraseSlot: sealEnvelope(masterKey, kek, AAD_PASSPHRASE_SLOT),
  };
  kek.fill(0);
  return updated;
}

/** Issues a fresh recovery key and invalidates the previous one. */
export function rotateRecoveryKey(
  keyfile: KeyfileV1,
  masterKey: Buffer,
  now: () => Date,
): { keyfile: KeyfileV1; recoveryKey: string } {
  const recoveryKeyBytes = randomBytes(RECOVERY_KEY_BYTES);
  const recoverySalt = newKdfSalt();
  const updated: KeyfileV1 = {
    ...keyfile,
    updatedAt: now().toISOString(),
    recoverySlot: sealEnvelope(
      masterKey,
      recoveryKek(recoveryKeyBytes, recoverySalt),
      AAD_RECOVERY_SLOT,
    ),
    recoverySaltB64: recoverySalt.toString('base64'),
  };
  const formatted = formatRecoveryKey(recoveryKeyBytes);
  recoveryKeyBytes.fill(0);
  return { keyfile: updated, recoveryKey: formatted };
}

/** Derives the SQLite database key (hex) from the master key. */
export function deriveDbKeyHex(masterKey: Buffer): string {
  return Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), DB_KEY_INFO, 32)).toString(
    'hex',
  );
}

/** Constant-time comparison helper for key material in tests and checks. */
export function keysEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
