import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AppError } from '@ajnutrition/shared';
import { deriveAttachmentKey, openBinary, sealBinary } from './binary-envelope';

const AAD = 'photo/abc-123';

describe('binary envelope', () => {
  it('round-trips megabyte-scale binary data without base64 bloat', () => {
    const key = randomBytes(32);
    const plaintext = randomBytes(2 * 1024 * 1024);
    const sealed = sealBinary(plaintext, key, AAD);
    // Constant overhead only: magic+version+nonce+tag = 36 bytes.
    expect(sealed.length).toBe(plaintext.length + 36);
    expect(openBinary(sealed, key, AAD).equals(plaintext)).toBe(true);
  });

  it('fails with wrong key, wrong AAD, tampered bytes, and foreign files', () => {
    const key = randomBytes(32);
    const sealed = sealBinary(Buffer.from('secreto'), key, AAD);

    expect(() => openBinary(sealed, randomBytes(32), AAD)).toThrowError(AppError);
    expect(() => openBinary(sealed, key, 'photo/other')).toThrowError(AppError);

    const tampered = Buffer.from(sealed);
    const lastIndex = tampered.length - 1;
    tampered[lastIndex] = (tampered[lastIndex] ?? 0) ^ 0xff;
    expect(() => openBinary(tampered, key, AAD)).toThrowError(AppError);

    expect(() => openBinary(Buffer.from('no es un contenedor'), key, AAD)).toThrowError(AppError);
  });

  it('derives a stable attachment key that differs from the master key', () => {
    const masterKey = randomBytes(32);
    const derived = deriveAttachmentKey(masterKey);
    expect(derived.length).toBe(32);
    expect(derived.equals(deriveAttachmentKey(masterKey))).toBe(true);
    expect(derived.equals(masterKey)).toBe(false);
  });
});
