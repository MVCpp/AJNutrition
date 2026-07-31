import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signLicenseToken, type LicensePayload } from './license';
import {
  DEFAULT_GRACE_DAYS,
  DEFAULT_TRIAL_DAYS,
  evaluateLicense,
  type LicenseRecord,
} from './license-state';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUBLIC_KEY = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const PRIVATE_KEY = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

const DAY_MS = 24 * 60 * 60 * 1000;
const at = (iso: string) => new Date(iso);

function licence(overrides: Partial<LicensePayload> = {}): string {
  return signLicenseToken(
    {
      v: 1,
      id: 'lic_0001',
      holder: 'Ana Jiménez',
      plan: 'annual',
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
      ...overrides,
    },
    PRIVATE_KEY,
  );
}

const record = (overrides: Partial<LicenseRecord> = {}): LicenseRecord => ({
  token: null,
  trialStartedAt: null,
  lastSeenAt: null,
  ...overrides,
});

describe('licence state machine', () => {
  it('gives a fresh install the full trial', () => {
    const status = evaluateLicense(
      record({ trialStartedAt: '2026-07-01T00:00:00.000Z' }),
      PUBLIC_KEY,
      at('2026-07-01T00:00:00.000Z'),
    );

    expect(status.state).toBe('trial');
    expect(status.canWrite).toBe(true);
    expect(status.daysRemaining).toBe(DEFAULT_TRIAL_DAYS);
  });

  it('expires the trial when nobody ever bought a licence', () => {
    const status = evaluateLicense(
      record({ trialStartedAt: '2026-01-01T00:00:00.000Z' }),
      PUBLIC_KEY,
      at('2026-07-01T00:00:00.000Z'),
    );

    expect(status.state).toBe('expired');
    expect(status.canWrite).toBe(false);
  });

  it('is active while the licence has time left', () => {
    const status = evaluateLicense(
      record({ token: licence() }),
      PUBLIC_KEY,
      at('2026-12-25T00:00:00.000Z'),
    );

    expect(status.state).toBe('active');
    expect(status.canWrite).toBe(true);
    expect(status.daysRemaining).toBe(7);
    expect(status.holder).toBe('Ana Jiménez');
    expect(status.plan).toBe('annual');
  });

  it('keeps every feature working during grace, and says how long is left', () => {
    const status = evaluateLicense(
      record({ token: licence() }),
      PUBLIC_KEY,
      at('2027-01-05T00:00:00.000Z'),
    );

    expect(status.state).toBe('grace');
    // The whole point of grace: a lapsed payment must not interrupt a consult.
    expect(status.canWrite).toBe(true);
    // Expired on the 1st, 4 days elapsed, so 10 of the 14 remain.
    expect(status.daysRemaining).toBe(DEFAULT_GRACE_DAYS - 4);
  });

  it('goes read-only only after grace runs out', () => {
    const dayBefore = evaluateLicense(
      record({ token: licence() }),
      PUBLIC_KEY,
      at(
        new Date(
          Date.parse('2027-01-01T00:00:00.000Z') + DEFAULT_GRACE_DAYS * DAY_MS - 1000,
        ).toISOString(),
      ),
    );
    const dayAfter = evaluateLicense(
      record({ token: licence() }),
      PUBLIC_KEY,
      at(
        new Date(
          Date.parse('2027-01-01T00:00:00.000Z') + DEFAULT_GRACE_DAYS * DAY_MS + 1000,
        ).toISOString(),
      ),
    );

    expect(dayBefore.canWrite).toBe(true);
    expect(dayAfter.state).toBe('expired');
    expect(dayAfter.canWrite).toBe(false);
  });

  it('renews cleanly: a longer licence replaces an expired one', () => {
    const status = evaluateLicense(
      record({ token: licence({ expiresAt: '2028-01-01T00:00:00.000Z' }) }),
      PUBLIC_KEY,
      at('2027-06-01T00:00:00.000Z'),
    );

    expect(status.state).toBe('active');
  });

  it('falls back to the trial rules — not a lockout — when the token is corrupt', () => {
    const status = evaluateLicense(
      record({ token: 'NPL1.garbage.garbage', trialStartedAt: '2026-07-20T00:00:00.000Z' }),
      PUBLIC_KEY,
      at('2026-07-30T00:00:00.000Z'),
    );

    // A damaged file must never be the reason she cannot write a consultation.
    expect(status.state).toBe('trial');
    expect(status.canWrite).toBe(true);
    expect(status.invalidToken).toBe(true);
  });

  it('does not honour a licence signed by someone else', () => {
    const forger = generateKeyPairSync('ed25519');
    const forged = signLicenseToken(
      {
        v: 1,
        id: 'lic_forged',
        holder: 'Ana Jiménez',
        plan: 'perpetual',
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
      forger.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    );

    const status = evaluateLicense(
      record({ token: forged, trialStartedAt: '2026-01-01T00:00:00.000Z' }),
      PUBLIC_KEY,
      at('2026-07-30T00:00:00.000Z'),
    );

    expect(status.invalidToken).toBe(true);
    expect(status.state).toBe('expired');
  });

  it('does not extend grace when the clock is wound back', () => {
    // She has been running the app up to 2027-02-01 (well past grace), then
    // sets the machine clock back to December.
    const status = evaluateLicense(
      record({ token: licence(), lastSeenAt: '2027-02-01T00:00:00.000Z' }),
      PUBLIC_KEY,
      at('2026-12-01T00:00:00.000Z'),
    );

    expect(status.state).toBe('expired');
    expect(status.clockTampered).toBe(true);
  });

  it('does not cry tampering over a small clock correction', () => {
    const status = evaluateLicense(
      record({ token: licence(), lastSeenAt: '2026-12-25T00:10:00.000Z' }),
      PUBLIC_KEY,
      at('2026-12-25T00:00:00.000Z'),
    );

    expect(status.clockTampered).toBe(false);
    expect(status.state).toBe('active');
  });

  it('never reports a negative countdown', () => {
    const status = evaluateLicense(
      record({ trialStartedAt: '2020-01-01T00:00:00.000Z' }),
      PUBLIC_KEY,
      at('2026-07-30T00:00:00.000Z'),
    );

    expect(status.daysRemaining).toBe(0);
  });

  it('goes read-only when the issuer suspends a licence that still has months left', () => {
    const status = evaluateLicense(
      record({ token: licence({ state: 'suspended' }) }),
      PUBLIC_KEY,
      at('2026-06-01T00:00:00.000Z'),
    );

    // The dates say active; the issuer says no. The issuer wins for WRITES.
    expect(status.state).toBe('suspended');
    expect(status.canWrite).toBe(false);
    // ...and the licence details still show, so she can quote them to support.
    expect(status.holder).toBe('Ana Jiménez');
    expect(status.licenseId).toBe('lic_0001');
  });

  it('treats a suspension as read-only, never as a lockout', () => {
    const suspended = evaluateLicense(
      record({ token: licence({ state: 'suspended' }) }),
      PUBLIC_KEY,
      at('2026-06-01T00:00:00.000Z'),
    );
    const expired = evaluateLicense(
      record({ token: licence() }),
      PUBLIC_KEY,
      at('2028-01-01T00:00:00.000Z'),
    );

    // Suspension must grant exactly what expiry grants — no more, and above
    // all no less. Whatever the reason for withholding writes, it changes
    // nothing about her right to open, print, export and back up her records.
    expect(suspended.canWrite).toBe(expired.canWrite);
  });

  it('lifts a suspension when a later licence says active', () => {
    const status = evaluateLicense(
      record({ token: licence({ issuedAt: '2026-07-01T00:00:00.000Z', state: 'active' }) }),
      PUBLIC_KEY,
      at('2026-08-01T00:00:00.000Z'),
    );

    expect(status.state).toBe('active');
    expect(status.canWrite).toBe(true);
  });

  it('refuses a token carrying a state it does not understand', () => {
    // An old client must not read a future, stricter state as "fine".
    const weird = signLicenseToken(
      {
        v: 1,
        id: 'lic_0001',
        holder: 'Ana Jiménez',
        plan: 'annual',
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2027-01-01T00:00:00.000Z',
        state: 'terminated' as never,
      },
      PRIVATE_KEY,
    );

    const status = evaluateLicense(
      record({ token: weird, trialStartedAt: '2026-01-01T00:00:00.000Z' }),
      PUBLIC_KEY,
      at('2026-06-01T00:00:00.000Z'),
    );

    expect(status.invalidToken).toBe(true);
  });
});
