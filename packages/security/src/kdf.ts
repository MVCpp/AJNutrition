import { randomBytes, scryptSync } from 'node:crypto';

/**
 * Passphrase KDF: scrypt (memory-hard, RFC 7914), built into Node.
 *
 * Chosen over Argon2id deliberately (ADR-0006 amendment): every Argon2
 * implementation for Node is a native module, and each extra native module is
 * packaging risk across Windows x64 / macOS arm64 Electron builds. scrypt at
 * these parameters is an OWASP-accepted memory-hard alternative.
 *
 * Parameters are stored alongside the ciphertext so they can be raised later;
 * old keyfiles remain readable and are re-wrapped on next passphrase change.
 */
export interface ScryptParams {
  algorithm: 'scrypt';
  /** CPU/memory cost. 2^17 → 128 MiB with r=8. */
  N: number;
  r: number;
  p: number;
}

/** OWASP-recommended scrypt work factor (N=2^17, r=8, p=1 → 128 MiB). */
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = {
  algorithm: 'scrypt',
  N: 131072,
  r: 8,
  p: 1,
};

export const KDF_SALT_BYTES = 32;
export const DERIVED_KEY_BYTES = 32;

export function newKdfSalt(): Buffer {
  return randomBytes(KDF_SALT_BYTES);
}

export function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Buffer,
  params: ScryptParams,
): Buffer {
  return scryptSync(passphrase.normalize('NFC'), salt, DERIVED_KEY_BYTES, {
    N: params.N,
    r: params.r,
    p: params.p,
    // scrypt needs 128*N*r bytes; leave generous headroom.
    maxmem: 512 * 1024 * 1024,
  });
}
