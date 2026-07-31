import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Console authentication: one admin, one password.
 *
 * There is exactly one operator, so roles, invitations and password resets
 * would be scaffolding around a problem that does not exist. What it does need
 * is to not be trivially brute-forceable and to not keep the password on disk.
 */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 } as const;

/**
 * `scrypt.<saltB64url>.<hashB64url>` — self-describing, one line, pasteable.
 *
 * Dots and base64url, NOT the conventional `$`-and-base64 shape. This value
 * lives in an environment variable, and `$` is expanded by every shell, .env
 * loader, systemd unit and docker-compose file it will ever pass through — a
 * mangled hash fails closed, but silently, and costs an hour to diagnose.
 * `+`, `/` and `=` cause the same class of trouble in other spots.
 */
export function hashPassword(password: string, salt = randomBytes(16)): string {
  const hash = scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return `scrypt.${salt.toString('base64url')}.${hash.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  let expected: Buffer;
  let salt: Buffer;
  try {
    salt = Buffer.from(parts[1] as string, 'base64url');
    expected = Buffer.from(parts[2] as string, 'base64url');
  } catch {
    return false;
  }
  if (expected.length === 0 || salt.length === 0) return false;
  const actual = scryptSync(password, salt, expected.length, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  // Constant time: a length mismatch alone must not be observable by timing.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Session cookie: `<expiryMs>.<hmac>`, signed with a server secret.
 *
 * Stateless on purpose — restarting the service should not sign the operator
 * out mid-task, and there is no session table to grow or to clean up.
 */
export function signSession(secret: string, expiresAtMs: number): string {
  const payload = String(expiresAtMs);
  const mac = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

export function verifySession(secret: string, cookie: string | undefined, nowMs: number): boolean {
  if (typeof cookie !== 'string') return false;
  const dot = cookie.indexOf('.');
  if (dot <= 0) return false;
  const payload = cookie.slice(0, dot);
  const mac = cookie.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const expiry = Number(payload);
  return Number.isFinite(expiry) && expiry > nowMs;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

/**
 * Failed-login throttle, in memory.
 *
 * Deliberately not persisted: a restart clearing it is fine, because the
 * password is scrypt-hashed and the real protection is the cost of the hash.
 * This just makes online guessing pointless.
 */
export class LoginThrottle {
  private failures = 0;
  private blockedUntilMs = 0;
  // An explicit field, not a `private readonly` constructor parameter: Node's
  // strip-only type removal cannot emit the assignment those imply, and this
  // service is run straight from source with no build step.
  private readonly maxFree: number;

  constructor(maxFree = 5) {
    this.maxFree = maxFree;
  }

  delayMs(nowMs: number): number {
    return Math.max(0, this.blockedUntilMs - nowMs);
  }

  fail(nowMs: number): void {
    this.failures += 1;
    if (this.failures <= this.maxFree) return;
    const over = this.failures - this.maxFree;
    // 2s, 4s, 8s … capped at five minutes.
    this.blockedUntilMs = nowMs + Math.min(300_000, 2 ** over * 1000);
  }

  succeed(): void {
    this.failures = 0;
    this.blockedUntilMs = 0;
  }
}
