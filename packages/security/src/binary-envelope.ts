import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { AppError } from '@ajnutrition/shared';

/**
 * Binary sealed container for large payloads (attachments). The JSON
 * EnvelopeV1 base64-bloats megabyte files by ~33%; this stores raw bytes:
 *
 *   MAGIC 'AJNENC1' (7) ┃ version (1) ┃ nonce (12) ┃ tag (16) ┃ ciphertext
 *
 * AAD binds the container to its context (e.g. the storage name), so a
 * sealed file swapped for another fails to open.
 */

const MAGIC = Buffer.from('AJNENC1', 'ascii');
const VERSION = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + 1 + NONCE_BYTES + TAG_BYTES;

const ATTACHMENT_KEY_INFO = 'ajnutrition/attachments-key/v1';

/** Derives the attachments encryption key from the master key. */
export function deriveAttachmentKey(masterKey: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), ATTACHMENT_KEY_INFO, 32));
}

export function sealBinary(plaintext: Uint8Array, key: Buffer, aadContext: string): Buffer {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(aadContext, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, Buffer.from([VERSION]), nonce, cipher.getAuthTag(), ciphertext]);
}

export function openBinary(sealed: Buffer, key: Buffer, aadContext: string): Buffer {
  const fail = (detail: string): never => {
    throw new AppError({
      code: 'ENCRYPTION',
      message: 'No fue posible descifrar el archivo adjunto.',
      internalDetail: `binary envelope: ${detail}`,
    });
  };
  if (sealed.length < HEADER_BYTES || !sealed.subarray(0, MAGIC.length).equals(MAGIC)) {
    fail('bad magic');
  }
  if (sealed[MAGIC.length] !== VERSION) fail(`unsupported version ${sealed[MAGIC.length]}`);
  const nonce = sealed.subarray(MAGIC.length + 1, MAGIC.length + 1 + NONCE_BYTES);
  const tag = sealed.subarray(MAGIC.length + 1 + NONCE_BYTES, HEADER_BYTES);
  const ciphertext = sealed.subarray(HEADER_BYTES);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(Buffer.from(aadContext, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    throw new AppError({
      code: 'ENCRYPTION',
      message: 'No fue posible descifrar el archivo adjunto.',
      internalDetail: `binary envelope open failed (aad=${aadContext})`,
      cause: err,
    });
  }
}
