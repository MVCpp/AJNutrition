import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { AppError } from '@ajnutrition/shared';

/**
 * Offline licence tokens (docs/product/subscription.md §2, option B).
 *
 * A licence is a single pasteable line:
 *
 *     NPL1.<base64url(payload JSON)>.<base64url(Ed25519 signature)>
 *
 * The app embeds only the PUBLIC key and verifies locally, so nothing here
 * needs a network. The signature covers the base64url payload segment exactly
 * as it appears in the token — not a re-serialization of the parsed object —
 * so key order or whitespace in the issuer's JSON can never change the bytes
 * that were signed.
 *
 * What a token deliberately does NOT contain: anything about the practice.
 * No patient counts, no usage, no machine fingerprint. A leaked token reveals
 * a name, a plan and two dates.
 */

export const LICENSE_TOKEN_PREFIX = 'NPL1';

export const LICENSE_PLANS = ['monthly', 'annual', 'perpetual'] as const;
export type LicensePlan = (typeof LICENSE_PLANS)[number];

export interface LicensePayload {
  v: 1;
  /** Licence id — the handle for revocation and support. Not a secret. */
  id: string;
  /** Who it was issued to, shown in Ajustes so she can check it is hers. */
  holder: string;
  plan: LicensePlan;
  issuedAt: string;
  /**
   * ISO instant after which the licence stops being active. `perpetual` still
   * carries one (far future) so the verifier has exactly one code path.
   */
  expiresAt: string;
}

function b64urlEncode(data: Buffer): string {
  return data.toString('base64url');
}

function licenseError(message: string, detail: string): AppError {
  return new AppError({ code: 'LICENSE', message, internalDetail: detail });
}

const MALFORMED = 'La licencia no tiene un formato válido. Copie el texto completo.';

function isIsoInstant(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/**
 * Parses without verifying. Never call this to decide whether a licence is
 * valid — an unsigned payload is attacker-controlled text.
 */
export function parseLicenseToken(token: string): LicensePayload {
  const segments = token.trim().split('.');
  if (segments.length !== 3 || segments[0] !== LICENSE_TOKEN_PREFIX) {
    throw licenseError(MALFORMED, `expected 3 segments with ${LICENSE_TOKEN_PREFIX} prefix`);
  }
  const [, payloadSegment] = segments;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payloadSegment as string, 'base64url').toString('utf8'));
  } catch (err) {
    throw licenseError(MALFORMED, `payload is not JSON: ${String(err)}`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw licenseError(MALFORMED, 'payload is not an object');
  }
  const candidate = parsed as Record<string, unknown>;
  if (candidate.v !== 1)
    throw licenseError(MALFORMED, `unsupported payload version ${candidate.v}`);
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    throw licenseError(MALFORMED, 'missing id');
  }
  if (typeof candidate.holder !== 'string' || candidate.holder.length === 0) {
    throw licenseError(MALFORMED, 'missing holder');
  }
  if (!LICENSE_PLANS.includes(candidate.plan as LicensePlan)) {
    throw licenseError(MALFORMED, `unknown plan ${String(candidate.plan)}`);
  }
  if (!isIsoInstant(candidate.issuedAt)) throw licenseError(MALFORMED, 'bad issuedAt');
  if (!isIsoInstant(candidate.expiresAt)) throw licenseError(MALFORMED, 'bad expiresAt');
  return {
    v: 1,
    id: candidate.id,
    holder: candidate.holder,
    plan: candidate.plan as LicensePlan,
    issuedAt: candidate.issuedAt,
    expiresAt: candidate.expiresAt,
  };
}

/** Public key as base64 SPKI DER — the form embedded in the app. */
export function publicKeyFromBase64(spkiBase64: string): KeyObject {
  try {
    return createPublicKey({
      key: Buffer.from(spkiBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
  } catch (err) {
    throw licenseError(
      'La verificación de licencias no está configurada correctamente.',
      `bad embedded public key: ${String(err)}`,
    );
  }
}

/**
 * Verifies the signature and returns the payload. Throws LICENSE on anything
 * that is not a genuine, well-formed token — including a token that is signed
 * by the wrong key, which is the case a forger produces.
 *
 * Expiry is NOT checked here: an expired-but-genuine licence is a different
 * situation from a forged one, and the state machine needs to tell them apart.
 */
export function verifyLicenseToken(token: string, publicKeySpkiBase64: string): LicensePayload {
  const segments = token.trim().split('.');
  if (segments.length !== 3 || segments[0] !== LICENSE_TOKEN_PREFIX) {
    throw licenseError(MALFORMED, `expected 3 segments with ${LICENSE_TOKEN_PREFIX} prefix`);
  }
  const [, payloadSegment, signatureSegment] = segments;
  const payload = parseLicenseToken(token);

  let signatureOk = false;
  try {
    signatureOk = verify(
      null,
      Buffer.from(payloadSegment as string, 'utf8'),
      publicKeyFromBase64(publicKeySpkiBase64),
      Buffer.from(signatureSegment as string, 'base64url'),
    );
  } catch (err) {
    throw licenseError('No fue posible verificar la licencia.', `verify threw: ${String(err)}`);
  }
  if (!signatureOk) {
    throw licenseError(
      'La firma de la licencia no es válida. Solicite una licencia nueva.',
      `bad signature for licence ${payload.id}`,
    );
  }
  return payload;
}

/**
 * Issuer side — used by `scripts/issue-license.mjs` and by the tests. The
 * private key never ships with the app; it lives in the issuer's secrets
 * store (docs/product/subscription.md §5).
 */
export function signLicenseToken(payload: LicensePayload, privateKeyPkcs8Base64: string): string {
  const payloadSegment = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyPkcs8Base64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = sign(null, Buffer.from(payloadSegment, 'utf8'), privateKey);
  return `${LICENSE_TOKEN_PREFIX}.${payloadSegment}.${b64urlEncode(signature)}`;
}
