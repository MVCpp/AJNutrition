import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  LoginThrottle,
  parseCookies,
  signSession,
  verifyPassword,
  verifySession,
} from './auth.ts';

describe('admin password', () => {
  it('round-trips', () => {
    const stored = hashPassword('correct horse battery staple');
    expect(verifyPassword('correct horse battery staple', stored)).toBe(true);
  });

  it('rejects the wrong password', () => {
    const stored = hashPassword('correct horse battery staple');
    expect(verifyPassword('correct horse battery stapl', stored)).toBe(false);
    expect(verifyPassword('', stored)).toBe(false);
  });

  it('never stores the password itself', () => {
    const stored = hashPassword('hunter2hunter2');
    expect(stored).not.toContain('hunter2');
    expect(stored.startsWith('scrypt.')).toBe(true);
    // Must survive an env file, a systemd unit and docker-compose untouched.
    expect(stored).not.toMatch(/[$+/=]/);
  });

  it('salts, so two identical passwords do not share a hash', () => {
    expect(hashPassword('same password here')).not.toBe(hashPassword('same password here'));
  });

  it.each([['garbage'], ['scrypt.only-two'], ['bcrypt.a.b'], [''], ['scrypt..']])(
    'refuses a malformed stored hash (%s)',
    (stored) => {
      expect(verifyPassword('anything', stored)).toBe(false);
    },
  );
});

describe('session cookie', () => {
  const SECRET = 'a-long-random-session-secret';
  const NOW = 1_800_000_000_000;

  it('accepts one it signed', () => {
    expect(verifySession(SECRET, signSession(SECRET, NOW + 1000), NOW)).toBe(true);
  });

  it('rejects one that has expired', () => {
    expect(verifySession(SECRET, signSession(SECRET, NOW - 1), NOW)).toBe(false);
  });

  it('rejects one signed with another secret', () => {
    expect(verifySession(SECRET, signSession('other-secret', NOW + 1000), NOW)).toBe(false);
  });

  it('rejects an extended expiry, because the signature covers it', () => {
    const cookie = signSession(SECRET, NOW + 1000);
    const tampered = `${NOW + 9_999_999}.${cookie.split('.')[1]}`;
    expect(verifySession(SECRET, tampered, NOW)).toBe(false);
  });

  it.each([[undefined], [''], ['nodot'], ['.onlymac'], ['abc.def']])(
    'rejects a malformed cookie (%s)',
    (cookie) => {
      expect(verifySession(SECRET, cookie, NOW)).toBe(false);
    },
  );
});

describe('cookie parsing', () => {
  it('reads a value among others', () => {
    expect(parseCookies('a=1; ajn_admin=xyz; b=2').ajn_admin).toBe('xyz');
  });

  it('survives an absent or odd header', () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('novalue')).toEqual({});
  });
});

describe('login throttle', () => {
  it('lets a few mistakes through, then makes guessing pointless', () => {
    const throttle = new LoginThrottle(3);
    const now = 1000;

    for (let i = 0; i < 3; i += 1) throttle.fail(now);
    expect(throttle.delayMs(now)).toBe(0);

    throttle.fail(now);
    expect(throttle.delayMs(now)).toBeGreaterThan(0);
  });

  it('backs off further with each additional failure, and caps', () => {
    const throttle = new LoginThrottle(0);
    const now = 0;
    throttle.fail(now);
    const first = throttle.delayMs(now);
    throttle.fail(now);
    expect(throttle.delayMs(now)).toBeGreaterThan(first);

    for (let i = 0; i < 50; i += 1) throttle.fail(now);
    expect(throttle.delayMs(now)).toBeLessThanOrEqual(300_000);
  });

  it('clears on a correct password', () => {
    const throttle = new LoginThrottle(0);
    throttle.fail(0);
    throttle.succeed();
    expect(throttle.delayMs(0)).toBe(0);
  });
});
