/**
 * Log redaction (S-110, §30 of the product brief). Logs are diagnostics, not
 * records: anything that looks like contact data or key material is masked
 * BEFORE it reaches disk. Redaction is a safety net on top of the primary
 * rule — sensitive values must not be passed to the logger in the first place.
 */

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// 32+ contiguous hex chars: keys, hashes, key-like tokens.
const LONG_HEX = /\b[0-9a-fA-F]{32,}\b/g;
// Recovery-key style groups (XXXXXXXX-XXXXXXXX-...).
const KEY_GROUPS = /\b(?:[0-9A-Fa-f]{8}-){3,}[0-9A-Fa-f]{8}\b/g;
// Long base64 runs: wrapped keys, ciphertext, tokens.
const LONG_BASE64 = /\b[A-Za-z0-9+/]{40,}={0,2}/g;
// Phone-like sequences of 8+ digits (allowing separators).
const PHONE_LIKE = /\+?\d[\d\s().-]{7,}\d/g;

const MAX_STRING_LENGTH = 500;

export function redactText(value: string): string {
  return value
    .replace(EMAIL, '[REDACTED-EMAIL]')
    .replace(KEY_GROUPS, '[REDACTED-KEY]')
    .replace(LONG_HEX, '[REDACTED-HEX]')
    .replace(LONG_BASE64, '[REDACTED-B64]')
    .replace(PHONE_LIKE, '[REDACTED-PHONE]')
    .slice(0, MAX_STRING_LENGTH);
}

export type LogMetaValue = string | number | boolean;
export type LogMeta = Record<string, LogMetaValue>;

/** Applies redaction to every string in a flat metadata map. */
export function redactMeta(meta: LogMeta): LogMeta {
  const out: LogMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    out[key] = typeof value === 'string' ? redactText(value) : value;
  }
  return out;
}
