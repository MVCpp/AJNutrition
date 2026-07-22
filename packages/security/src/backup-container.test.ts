import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AppError } from '@ajnutrition/shared';
import {
  BACKUP_MAGIC,
  decryptBackupPayload,
  readBackupContainer,
  writeBackupContainer,
  sha256Hex,
} from './backup-container';
import { createKeyfile } from './keyfile';
import type { ScryptParams } from './kdf';

const TEST_KDF: ScryptParams = { algorithm: 'scrypt', N: 16384, r: 8, p: 1 };
const NOW = () => new Date('2026-07-22T12:00:00.000Z');

function makeBackup(payloadText = 'contenido-del-respaldo') {
  const { keyfile, masterKey } = createKeyfile('frase-de-acceso-larga', NOW, TEST_KDF);
  const payload = Buffer.from(payloadText, 'utf8');
  const container = writeBackupContainer({
    payload,
    masterKey,
    keyfile,
    meta: {
      createdAt: '2026-07-22T12:00:00.000Z',
      appVersion: '0.1.0',
      schemaVersion: 1,
      description: 'Respaldo de prueba',
    },
  });
  return { container, masterKey, payload };
}

describe('backup container round-trip', () => {
  it('writes and reads back header metadata and decrypts the payload', () => {
    const { container, masterKey, payload } = makeBackup();
    const parsed = readBackupContainer(container);
    expect(parsed.header).toMatchObject({
      formatVersion: 1,
      appVersion: '0.1.0',
      schemaVersion: 1,
      description: 'Respaldo de prueba',
    });
    expect(decryptBackupPayload(parsed, masterKey)).toEqual(payload);
  });

  it('never contains the payload plaintext or the master key', () => {
    const { container, masterKey } = makeBackup('TEXTO_CLARO_MARCADOR');
    expect(container.includes(Buffer.from('TEXTO_CLARO_MARCADOR'))).toBe(false);
    expect(container.includes(Buffer.from(masterKey.toString('hex')))).toBe(false);
    expect(container.includes(masterKey)).toBe(false);
  });

  it('rejects decryption with a wrong master key', () => {
    const { container } = makeBackup();
    const parsed = readBackupContainer(container);
    try {
      decryptBackupPayload(parsed, randomBytes(32));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('ENCRYPTION');
    }
  });
});

describe('backup container tamper detection', () => {
  it('rejects files without the magic prefix and truncated files', () => {
    const { container } = makeBackup();
    expect(() => readBackupContainer(Buffer.from('no-un-respaldo'))).toThrowError(AppError);
    expect(() => readBackupContainer(container.subarray(0, 20))).toThrowError(AppError);
    expect(() => readBackupContainer(Buffer.concat([BACKUP_MAGIC]))).toThrowError(AppError);
  });

  it('detects a flipped payload byte via the hash pre-check (no secret needed)', () => {
    const { container } = makeBackup();
    const tampered = Buffer.from(container);
    const lastIndex = tampered.length - 1;
    tampered[lastIndex] = (tampered[lastIndex] ?? 0) ^ 0xff;
    try {
      readBackupContainer(tampered);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('INTEGRITY');
    }
  });

  it('detects header tampering even when the payload hash is recomputed to match', () => {
    const { container, masterKey } = makeBackup();
    const headerLength = container.readUInt32LE(8);
    const header = JSON.parse(container.subarray(12, 12 + headerLength).toString('utf8'));
    const ciphertext = container.subarray(12 + headerLength);

    // Attacker edits a bound field AND fixes the hash to look consistent.
    header.schemaVersion = 999;
    header.payloadSha256 = sha256Hex(ciphertext);
    const forgedHeader = Buffer.from(JSON.stringify(header), 'utf8');
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32LE(forgedHeader.length);
    const forged = Buffer.concat([BACKUP_MAGIC, prefix, forgedHeader, ciphertext]);

    // Outer parse succeeds (hash matches) but GCM AAD binding fails on decrypt.
    const parsed = readBackupContainer(forged);
    try {
      decryptBackupPayload(parsed, masterKey);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('ENCRYPTION');
    }
  });

  it('refuses containers from a newer format version with a clear message', () => {
    const { container } = makeBackup();
    const headerLength = container.readUInt32LE(8);
    const header = JSON.parse(container.subarray(12, 12 + headerLength).toString('utf8'));
    header.formatVersion = 2;
    const forgedHeader = Buffer.from(JSON.stringify(header), 'utf8');
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32LE(forgedHeader.length);
    const forged = Buffer.concat([
      BACKUP_MAGIC,
      prefix,
      forgedHeader,
      container.subarray(12 + headerLength),
    ]);
    try {
      readBackupContainer(forged);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('RESTORE');
    }
  });
});
