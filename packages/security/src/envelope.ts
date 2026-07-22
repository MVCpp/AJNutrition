import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppError } from '@ajnutrition/shared';

/**
 * Versioned authenticated-encryption envelope (AES-256-GCM).
 * Tampering with any field — ciphertext, nonce, tag, or the AAD context —
 * makes decryption fail; there is no "partially valid" result.
 */
export interface EnvelopeV1 {
  v: 1;
  alg: 'aes-256-gcm';
  nonceB64: string;
  ciphertextB64: string;
  tagB64: string;
}

const NONCE_BYTES = 12;

export function sealEnvelope(plaintext: Buffer, key: Buffer, aadContext: string): EnvelopeV1 {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(aadContext, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    v: 1,
    alg: 'aes-256-gcm',
    nonceB64: nonce.toString('base64'),
    ciphertextB64: ciphertext.toString('base64'),
    tagB64: cipher.getAuthTag().toString('base64'),
  };
}

export function openEnvelope(envelope: EnvelopeV1, key: Buffer, aadContext: string): Buffer {
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.nonceB64, 'base64'));
    decipher.setAAD(Buffer.from(aadContext, 'utf8'));
    decipher.setAuthTag(Buffer.from(envelope.tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertextB64, 'base64')),
      decipher.final(),
    ]);
  } catch (err) {
    throw new AppError({
      code: 'ENCRYPTION',
      message: 'No fue posible descifrar los datos protegidos.',
      internalDetail: `envelope open failed (aad=${aadContext})`,
      cause: err,
    });
  }
}
