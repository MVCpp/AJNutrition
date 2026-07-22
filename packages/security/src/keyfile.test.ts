import { describe, expect, it } from 'vitest';
import { AppError } from '@ajnutrition/shared';
import type { ScryptParams } from './kdf';
import {
  createKeyfile,
  deriveDbKeyHex,
  formatRecoveryKey,
  keysEqual,
  parseRecoveryKey,
  rewrapPassphraseSlot,
  rotateRecoveryKey,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
} from './keyfile';

/** Reduced work factor so the suite stays fast; production uses DEFAULT_SCRYPT_PARAMS. */
const TEST_KDF: ScryptParams = { algorithm: 'scrypt', N: 16384, r: 8, p: 1 };
const NOW = () => new Date('2026-07-22T10:00:00.000Z');
const PASSPHRASE = 'frase-de-acceso-larga';

describe('keyfile lifecycle', () => {
  it('creates a keyfile whose passphrase slot and recovery slot unwrap the same master key', () => {
    const created = createKeyfile(PASSPHRASE, NOW, TEST_KDF);
    const viaPassphrase = unlockWithPassphrase(created.keyfile, PASSPHRASE);
    const viaRecovery = unlockWithRecoveryKey(created.keyfile, created.recoveryKey);
    expect(keysEqual(viaPassphrase, created.masterKey)).toBe(true);
    expect(keysEqual(viaRecovery, created.masterKey)).toBe(true);
  });

  it('rejects a wrong passphrase with AUTHORIZATION (not ENCRYPTION internals)', () => {
    const created = createKeyfile(PASSPHRASE, NOW, TEST_KDF);
    try {
      unlockWithPassphrase(created.keyfile, 'frase-equivocada-123');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('AUTHORIZATION');
    }
  });

  it('rejects a wrong recovery key', () => {
    const created = createKeyfile(PASSPHRASE, NOW, TEST_KDF);
    const wrong = formatRecoveryKey(Buffer.alloc(32, 7));
    expect(() => unlockWithRecoveryKey(created.keyfile, wrong)).toThrowError(AppError);
  });

  it('enforces the minimum passphrase length', () => {
    expect(() => createKeyfile('corta', NOW, TEST_KDF)).toThrowError(AppError);
  });

  it('rewrapping the passphrase slot invalidates the old passphrase and keeps the master key', () => {
    const created = createKeyfile(PASSPHRASE, NOW, TEST_KDF);
    const updated = rewrapPassphraseSlot(
      created.keyfile,
      created.masterKey,
      'nueva-frase-de-acceso',
      NOW,
      TEST_KDF,
    );
    expect(() => unlockWithPassphrase(updated, PASSPHRASE)).toThrowError(AppError);
    expect(
      keysEqual(unlockWithPassphrase(updated, 'nueva-frase-de-acceso'), created.masterKey),
    ).toBe(true);
    // Recovery slot untouched by a passphrase change.
    expect(keysEqual(unlockWithRecoveryKey(updated, created.recoveryKey), created.masterKey)).toBe(
      true,
    );
  });

  it('rotating the recovery key invalidates the old one', () => {
    const created = createKeyfile(PASSPHRASE, NOW, TEST_KDF);
    const rotated = rotateRecoveryKey(created.keyfile, created.masterKey, NOW);
    expect(() => unlockWithRecoveryKey(rotated.keyfile, created.recoveryKey)).toThrowError(
      AppError,
    );
    expect(
      keysEqual(unlockWithRecoveryKey(rotated.keyfile, rotated.recoveryKey), created.masterKey),
    ).toBe(true);
  });

  it('derives a stable 64-hex database key that differs from the master key', () => {
    const created = createKeyfile(PASSPHRASE, NOW, TEST_KDF);
    const dbKey = deriveDbKeyHex(created.masterKey);
    expect(dbKey).toMatch(/^[0-9a-f]{64}$/);
    expect(deriveDbKeyHex(created.masterKey)).toBe(dbKey);
    expect(dbKey).not.toBe(created.masterKey.toString('hex'));
  });
});

describe('recovery key formatting', () => {
  it('round-trips through format and parse, tolerating spaces and case', () => {
    const bytes = Buffer.alloc(32, 0xab);
    const formatted = formatRecoveryKey(bytes);
    expect(formatted).toMatch(/^([0-9A-F]{8}-){7}[0-9A-F]{8}$/);
    expect(parseRecoveryKey(formatted.toLowerCase().replaceAll('-', ' '))).toEqual(bytes);
  });

  it('rejects malformed input', () => {
    expect(() => parseRecoveryKey('no-es-una-clave')).toThrowError(AppError);
  });
});
