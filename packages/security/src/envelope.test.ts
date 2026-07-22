import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AppError } from '@ajnutrition/shared';
import { openEnvelope, sealEnvelope } from './envelope';

const AAD = 'test/context';

describe('envelope (AES-256-GCM)', () => {
  it('round-trips plaintext', () => {
    const key = randomBytes(32);
    const plaintext = Buffer.from('datos-sensibles-ñ-á-€', 'utf8');
    const envelope = sealEnvelope(plaintext, key, AAD);
    expect(openEnvelope(envelope, key, AAD).toString('utf8')).toBe('datos-sensibles-ñ-á-€');
  });

  it('produces unique nonces per seal', () => {
    const key = randomBytes(32);
    const a = sealEnvelope(Buffer.from('x'), key, AAD);
    const b = sealEnvelope(Buffer.from('x'), key, AAD);
    expect(a.nonceB64).not.toBe(b.nonceB64);
    expect(a.ciphertextB64).not.toBe(b.ciphertextB64);
  });

  it('fails with the wrong key', () => {
    const envelope = sealEnvelope(Buffer.from('secret'), randomBytes(32), AAD);
    expect(() => openEnvelope(envelope, randomBytes(32), AAD)).toThrowError(AppError);
  });

  it('fails when the AAD context differs', () => {
    const key = randomBytes(32);
    const envelope = sealEnvelope(Buffer.from('secret'), key, AAD);
    expect(() => openEnvelope(envelope, key, 'other/context')).toThrowError(AppError);
  });

  it('detects tampering of ciphertext, tag, and nonce', () => {
    const key = randomBytes(32);
    const envelope = sealEnvelope(Buffer.from('secret-secret-secret'), key, AAD);

    const flipByte = (b64: string): string => {
      const buf = Buffer.from(b64, 'base64');
      const firstByte = buf[0] ?? 0;
      buf[0] = firstByte ^ 0xff;
      return buf.toString('base64');
    };

    expect(() =>
      openEnvelope({ ...envelope, ciphertextB64: flipByte(envelope.ciphertextB64) }, key, AAD),
    ).toThrowError(AppError);
    expect(() =>
      openEnvelope({ ...envelope, tagB64: flipByte(envelope.tagB64) }, key, AAD),
    ).toThrowError(AppError);
    expect(() =>
      openEnvelope({ ...envelope, nonceB64: flipByte(envelope.nonceB64) }, key, AAD),
    ).toThrowError(AppError);
  });

  it('reports tamper failures as ENCRYPTION errors without leaking key material', () => {
    const key = randomBytes(32);
    const envelope = sealEnvelope(Buffer.from('secret'), key, AAD);
    try {
      openEnvelope(envelope, randomBytes(32), AAD);
      expect.unreachable('should have thrown');
    } catch (err) {
      const appError = err as AppError;
      expect(appError.code).toBe('ENCRYPTION');
      expect(appError.message).not.toContain(key.toString('hex'));
    }
  });
});
