import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppError } from '@ajnutrition/shared';
import { signLicenseToken, type LicensePayload } from '@ajnutrition/security';
import { LicenseManager, toLicenseStatusDto } from './license-manager';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUBLIC_KEY = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const PRIVATE_KEY = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

const dirs: string[] = [];
function newUserDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'ajn-license-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

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

function manager(userDataPath: string, nowIso: string, publicKeyOverride = PUBLIC_KEY) {
  return new LicenseManager({
    userDataPath,
    publicKey: publicKeyOverride,
    now: () => new Date(nowIso),
  });
}

describe('LicenseManager', () => {
  it('is completely inert until an issuer key is compiled in', () => {
    const dir = newUserDataDir();
    const inert = manager(dir, '2030-01-01T00:00:00.000Z', '');

    // Shipping the machinery must not expire an app nobody is selling yet.
    expect(inert.enforced).toBe(false);
    expect(inert.canWrite()).toBe(true);
    expect(inert.status().state).toBe('active');
    expect(() => inert.activate(licence())).toThrow(AppError);
  });

  it('starts the trial on first run and remembers when it started', () => {
    const dir = newUserDataDir();

    const first = manager(dir, '2026-07-01T00:00:00.000Z').status();
    expect(first.state).toBe('trial');
    expect(first.daysRemaining).toBe(30);

    // Ten days later the same install is ten days further into the trial —
    // the start date is persisted, not recomputed on every launch.
    const later = manager(dir, '2026-07-11T00:00:00.000Z').status();
    expect(later.state).toBe('trial');
    expect(later.daysRemaining).toBe(20);
  });

  it('goes read-only when the trial runs out with no licence', () => {
    const dir = newUserDataDir();
    manager(dir, '2026-07-01T00:00:00.000Z').status();

    const after = manager(dir, '2026-09-01T00:00:00.000Z');
    expect(after.status().state).toBe('expired');
    expect(after.canWrite()).toBe(false);
  });

  it('activates a valid licence and keeps it across restarts', () => {
    const dir = newUserDataDir();
    const activated = manager(dir, '2026-07-01T00:00:00.000Z').activate(licence());

    expect(activated.state).toBe('active');
    expect(activated.holder).toBe('Ana Jiménez');
    // A restart a month later reads the same licence back off disk.
    expect(manager(dir, '2026-08-01T00:00:00.000Z').status().state).toBe('active');
  });

  it('refuses a forged licence without touching the stored one', () => {
    const dir = newUserDataDir();
    manager(dir, '2026-07-01T00:00:00.000Z').activate(licence());

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

    expect(() => manager(dir, '2026-07-02T00:00:00.000Z').activate(forged)).toThrow(AppError);
    // The good licence is still there — a bad paste must not destroy it.
    expect(manager(dir, '2026-07-02T00:00:00.000Z').status().licenseId).toBe('lic_0001');
  });

  it('refuses a licence that is already dead, and says when it died', () => {
    const dir = newUserDataDir();
    const mgr = manager(dir, '2027-06-01T00:00:00.000Z');

    try {
      mgr.activate(licence());
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      // "It expired in January" beats a silent downgrade to read-only.
      expect((err as AppError).message).toContain('2027-01-01');
    }
  });

  it('accepts a renewal while the current licence is still running', () => {
    const dir = newUserDataDir();
    manager(dir, '2026-07-01T00:00:00.000Z').activate(licence());

    const renewed = manager(dir, '2026-12-20T00:00:00.000Z').activate(
      licence({ id: 'lic_0002', expiresAt: '2028-01-01T00:00:00.000Z' }),
    );

    expect(renewed.licenseId).toBe('lic_0002');
    expect(renewed.daysRemaining).toBeGreaterThan(365);
  });

  it('does not let a wound-back clock buy more time', () => {
    const dir = newUserDataDir();
    manager(dir, '2026-07-01T00:00:00.000Z').activate(licence());
    // She keeps running the app well past the end of grace...
    manager(dir, '2027-03-01T00:00:00.000Z').status();

    // ...then sets the machine clock back to before the expiry date.
    const rewound = manager(dir, '2026-12-01T00:00:00.000Z').status();

    expect(rewound.state).toBe('expired');
    expect(rewound.clockTampered).toBe(true);
  });

  it('falls back to the trial rules when the stored file is corrupt', () => {
    const dir = newUserDataDir();
    writeFileSync(path.join(dir, 'license.json'), '{ not json');

    const status = manager(dir, '2026-07-01T00:00:00.000Z').status();

    // A damaged file is not a reason to stop her writing a consultation.
    expect(status.state).toBe('trial');
    expect(status.canWrite).toBe(true);
  });

  it('stores nothing about the practice', () => {
    const dir = newUserDataDir();
    manager(dir, '2026-07-01T00:00:00.000Z').activate(licence());

    const stored = JSON.parse(readFileSync(path.join(dir, 'license.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(Object.keys(stored).sort()).toEqual(['lastSeenAt', 'token', 'trialStartedAt']);
  });

  it('maps to a DTO carrying the enforcement flag', () => {
    const dir = newUserDataDir();
    const mgr = manager(dir, '2026-07-01T00:00:00.000Z');
    const dto = toLicenseStatusDto(mgr.status(), mgr.enforced);

    expect(dto.enforced).toBe(true);
    expect(dto.state).toBe('trial');
  });
});
