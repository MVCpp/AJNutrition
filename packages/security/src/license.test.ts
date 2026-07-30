import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AppError } from '@ajnutrition/shared';
import {
  LICENSE_TOKEN_PREFIX,
  parseLicenseToken,
  signLicenseToken,
  verifyLicenseToken,
  type LicensePayload,
} from './license';

function newIssuer() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyBase64: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    privateKeyBase64: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  };
}

const payload: LicensePayload = {
  v: 1,
  id: 'lic_0001',
  holder: 'Nutrióloga Ana Jiménez',
  plan: 'annual',
  issuedAt: '2026-07-30T00:00:00.000Z',
  expiresAt: '2027-07-30T00:00:00.000Z',
};

describe('licence tokens', () => {
  it('round-trips a signed token', () => {
    const issuer = newIssuer();
    const token = signLicenseToken(payload, issuer.privateKeyBase64);

    expect(token.startsWith(`${LICENSE_TOKEN_PREFIX}.`)).toBe(true);
    expect(verifyLicenseToken(token, issuer.publicKeyBase64)).toEqual(payload);
  });

  it('rejects a token signed by a different key', () => {
    const real = newIssuer();
    const forger = newIssuer();
    const forged = signLicenseToken(
      { ...payload, expiresAt: '2099-01-01T00:00:00.000Z' },
      forger.privateKeyBase64,
    );

    expect(() => verifyLicenseToken(forged, real.publicKeyBase64)).toThrow(AppError);
  });

  it('rejects a token whose payload was edited after signing', () => {
    const issuer = newIssuer();
    const token = signLicenseToken(payload, issuer.privateKeyBase64);
    const [prefix, , signature] = token.split('.');
    // The obvious attack: extend expiresAt by hand and keep the signature.
    const edited = Buffer.from(
      JSON.stringify({ ...payload, expiresAt: '2099-01-01T00:00:00.000Z' }),
      'utf8',
    ).toString('base64url');

    expect(() => verifyLicenseToken(`${prefix}.${edited}.${signature}`, issuer.publicKeyBase64)) //
      .toThrow(AppError);
  });

  it('verifies the token bytes, not a re-serialization of the payload', () => {
    // Same fields, different key order: the signature covers the segment as
    // written, so a re-ordered payload must NOT verify against it.
    const issuer = newIssuer();
    const token = signLicenseToken(payload, issuer.privateKeyBase64);
    const [prefix, , signature] = token.split('.');
    const reordered = Buffer.from(
      JSON.stringify({
        expiresAt: payload.expiresAt,
        issuedAt: payload.issuedAt,
        plan: payload.plan,
        holder: payload.holder,
        id: payload.id,
        v: payload.v,
      }),
      'utf8',
    ).toString('base64url');

    expect(() => verifyLicenseToken(`${prefix}.${reordered}.${signature}`, issuer.publicKeyBase64)) //
      .toThrow(AppError);
  });

  it.each([
    ['empty', ''],
    ['wrong prefix', 'NPL9.aaa.bbb'],
    ['two segments', 'NPL1.aaa'],
    [
      'payload is not JSON',
      `${LICENSE_TOKEN_PREFIX}.${Buffer.from('nope').toString('base64url')}.x`,
    ],
  ])('rejects a malformed token (%s)', (_label, token) => {
    expect(() => verifyLicenseToken(token, newIssuer().publicKeyBase64)).toThrow(AppError);
  });

  it.each([
    ['unknown plan', { ...payload, plan: 'lifetime' }],
    ['missing holder', { ...payload, holder: '' }],
    ['bad date', { ...payload, expiresAt: 'soon' }],
    ['future payload version', { ...payload, v: 2 }],
  ])('rejects a payload that is not a v1 licence (%s)', (_label, bad) => {
    const encoded = Buffer.from(JSON.stringify(bad), 'utf8').toString('base64url');
    expect(() => parseLicenseToken(`${LICENSE_TOKEN_PREFIX}.${encoded}.x`)).toThrow(AppError);
  });

  it('surfaces a LICENSE error code, never a raw crypto failure', () => {
    try {
      verifyLicenseToken('garbage', newIssuer().publicKeyBase64);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('LICENSE');
      // The message reaches the practitioner: it must be actionable Spanish,
      // not a stack trace or an OpenSSL string.
      expect((err as AppError).serialize().message).toMatch(/licencia/i);
    }
  });

  it('tolerates surrounding whitespace, because the token arrives pasted', () => {
    const issuer = newIssuer();
    const token = signLicenseToken(payload, issuer.privateKeyBase64);
    expect(verifyLicenseToken(`\n  ${token}\t\n`, issuer.publicKeyBase64)).toEqual(payload);
  });
});
