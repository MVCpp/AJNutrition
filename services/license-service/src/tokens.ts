import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

/**
 * Licence token signing and verification, standalone.
 *
 * This deliberately does NOT import `@ajnutrition/security`, even though that
 * package holds the same logic. The workspace packages use extensionless
 * imports, which Vite and Vitest resolve and Node's ESM resolver does not — so
 * importing them here would force a bundler into the deployment of the one
 * machine that holds the signing key. Keeping this file self-contained means
 * the service runs on `node` and nothing else.
 *
 * The duplication is real and is paid for by `tokens.test.ts`, which signs
 * with this file and verifies with `@ajnutrition/security` (and back), so the
 * two can never drift apart unnoticed. `scripts/issue-license.mjs` carries the
 * same guarantee for the same reason.
 */

export const LICENSE_TOKEN_PREFIX = 'NPL1';

export type LicensePlan = 'monthly' | 'annual' | 'perpetual';

export interface TokenPayload {
  v: 1;
  id: string;
  holder: string;
  plan: LicensePlan;
  /** Absent means active. Present and `suspended` means read-only. */
  state?: 'active' | 'suspended';
  issuedAt: string;
  expiresAt: string;
}

export function signToken(payload: TokenPayload, privateKeyPkcs8Base64: string): string {
  const segment = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const key = createPrivateKey({
    key: Buffer.from(privateKeyPkcs8Base64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = sign(null, Buffer.from(segment, 'utf8'), key).toString('base64url');
  return `${LICENSE_TOKEN_PREFIX}.${segment}.${signature}`;
}

/**
 * Returns the payload, or null for anything that is not a genuine token.
 *
 * Null rather than throwing: every caller here is handling input from an
 * unauthenticated request, where "not valid" is an ordinary outcome and not an
 * exceptional one.
 */
export function verifyToken(token: string, publicKeySpkiBase64: string): TokenPayload | null {
  const segments = token.trim().split('.');
  if (segments.length !== 3 || segments[0] !== LICENSE_TOKEN_PREFIX) return null;
  const [, payloadSegment, signatureSegment] = segments;

  try {
    const ok = verify(
      null,
      Buffer.from(payloadSegment as string, 'utf8'),
      createPublicKey({
        key: Buffer.from(publicKeySpkiBase64, 'base64'),
        format: 'der',
        type: 'spki',
      }),
      Buffer.from(signatureSegment as string, 'base64url'),
    );
    if (!ok) return null;
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payloadSegment as string, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;
  if (candidate.v !== 1) return null;
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) return null;
  if (typeof candidate.holder !== 'string' || candidate.holder.length === 0) return null;
  if (
    candidate.plan !== 'monthly' &&
    candidate.plan !== 'annual' &&
    candidate.plan !== 'perpetual'
  ) {
    return null;
  }
  if (
    candidate.state !== undefined &&
    candidate.state !== 'active' &&
    candidate.state !== 'suspended'
  ) {
    return null;
  }
  if (typeof candidate.issuedAt !== 'string' || Number.isNaN(Date.parse(candidate.issuedAt))) {
    return null;
  }
  if (typeof candidate.expiresAt !== 'string' || Number.isNaN(Date.parse(candidate.expiresAt))) {
    return null;
  }
  return candidate as unknown as TokenPayload;
}

/** Boot-time check that the configured public key is usable at all. */
export function assertPublicKey(publicKeySpkiBase64: string): void {
  createPublicKey({
    key: Buffer.from(publicKeySpkiBase64, 'base64'),
    format: 'der',
    type: 'spki',
  });
}
