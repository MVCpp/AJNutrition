import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  evaluateLicense,
  signLicenseToken,
  verifyLicenseToken,
  type LicensePayload,
} from '@ajnutrition/security';
import { signToken, verifyToken, type TokenPayload } from './tokens.ts';

/**
 * This service signs licences with its own copy of the token format, because
 * the workspace packages use extensionless imports that Node's ESM resolver
 * cannot follow — importing them would force a bundler onto the machine that
 * holds the signing key.
 *
 * That duplication is only acceptable while it cannot drift. This file is the
 * payment: everything the service signs must satisfy the app's verifier, and
 * everything the app would accept must satisfy the service's.
 *
 * If this file ever fails, every licence sold stops working. Fix the two
 * implementations, do not relax the test.
 */

const pair = generateKeyPairSync('ed25519');
const PRIVATE_KEY = pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const PUBLIC_KEY = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

const payload: TokenPayload = {
  v: 1,
  id: 'lic_0001',
  holder: 'Nutrióloga Ana Jiménez',
  plan: 'annual',
  issuedAt: '2026-07-31T00:00:00.000Z',
  expiresAt: '2027-09-04T00:00:00.000Z',
};

describe('the service and the desktop app agree about tokens', () => {
  it('produces byte-identical tokens for the same payload', () => {
    // Not merely "both verify" — the SAME bytes. Ed25519 is deterministic, so
    // any difference here means the two disagree about what gets signed.
    expect(signToken(payload, PRIVATE_KEY)).toBe(
      signLicenseToken(payload as LicensePayload, PRIVATE_KEY),
    );
  });

  it('signs something the app accepts', () => {
    const token = signToken(payload, PRIVATE_KEY);
    expect(verifyLicenseToken(token, PUBLIC_KEY)).toEqual(payload);
  });

  it('accepts what the app signs', () => {
    const token = signLicenseToken(payload as LicensePayload, PRIVATE_KEY);
    expect(verifyToken(token, PUBLIC_KEY)).toEqual(payload);
  });

  it('agrees about suspensions, which is the whole deactivation path', () => {
    const suspended: TokenPayload = { ...payload, state: 'suspended' };
    const token = signToken(suspended, PRIVATE_KEY);

    expect(verifyLicenseToken(token, PUBLIC_KEY).state).toBe('suspended');
    // And the app's state machine draws the intended conclusion from it.
    const seen = evaluateLicense(
      { token, trialStartedAt: null, lastSeenAt: null },
      PUBLIC_KEY,
      new Date('2026-08-01T00:00:00.000Z'),
    );
    expect(seen.state).toBe('suspended');
    expect(seen.canWrite).toBe(false);
  });

  it.each([
    ['a forged signature', () => `${signToken(payload, PRIVATE_KEY).slice(0, -4)}AAAA`],
    [
      'an edited payload',
      () => {
        const [prefix, , sig] = signToken(payload, PRIVATE_KEY).split('.');
        const edited = Buffer.from(
          JSON.stringify({ ...payload, expiresAt: '2099-01-01T00:00:00.000Z' }),
        ).toString('base64url');
        return `${prefix}.${edited}.${sig}`;
      },
    ],
    ['gibberish', () => 'NPL1.aaa.bbb'],
    ['an empty string', () => ''],
  ])('both reject %s', (_label, make) => {
    const token = make();
    expect(verifyToken(token, PUBLIC_KEY)).toBeNull();
    expect(() => verifyLicenseToken(token, PUBLIC_KEY)).toThrow();
  });

  it('both reject a licence signed by a different issuer', () => {
    const other = generateKeyPairSync('ed25519');
    const forged = signToken(
      payload,
      other.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    );

    expect(verifyToken(forged, PUBLIC_KEY)).toBeNull();
    expect(() => verifyLicenseToken(forged, PUBLIC_KEY)).toThrow();
  });
});
