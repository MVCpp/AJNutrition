import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { signLicenseToken, type LicensePayload } from '@ajnutrition/security';
import { refreshLicense, type LicenseRefreshDeps } from './license-refresh';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUBLIC_KEY = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const PRIVATE_KEY = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

function licence(overrides: Partial<LicensePayload> = {}, key = PRIVATE_KEY): string {
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
    key,
  );
}

const STORED = licence();
const REQUEST = { deviceId: 'dev-1', appVersion: '0.1.0' };

function deps(fetchImpl: unknown, overrides: Partial<LicenseRefreshDeps> = {}): LicenseRefreshDeps {
  return {
    endpoint: 'https://licences.example/refresh',
    publicKey: PUBLIC_KEY,
    appVersion: '0.1.0',
    fetchImpl: fetchImpl as typeof fetch,
    ...overrides,
  };
}

// Typed via the generic so `mock.calls[0]` is a real tuple and the assertions
// below can read what was actually sent — without declaring parameters the
// implementation ignores, which this workspace's lint rules reject.
type FetchLike = (url: string, init?: RequestInit) => Promise<unknown>;

const respond = (body: unknown, ok = true, status = 200) =>
  vi.fn<FetchLike>(async () => ({ ok, status, json: async () => body }));

describe('licence refresh — nothing may cost her anything', () => {
  it.each([
    ['the network is down', () => Promise.reject(new Error('ENOTFOUND'))],
    ['the request times out', () => Promise.reject(new Error('AbortError'))],
    [
      'the body is not JSON',
      () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new Error('bad json')),
        }),
    ],
  ])('leaves the licence alone when %s', async (_label, impl) => {
    const result = await refreshLicense(STORED, REQUEST, deps(vi.fn(impl)));
    expect(result.kind).toBe('unchanged');
  });

  it.each([500, 502, 404, 401])('leaves the licence alone on HTTP %i', async (status) => {
    const result = await refreshLicense(STORED, REQUEST, deps(respond({}, false, status)));
    expect(result).toEqual({ kind: 'unchanged', reason: `http ${status}` });
  });

  it('does nothing at all when no endpoint is configured', async () => {
    const fetchImpl = respond({});
    const result = await refreshLicense(STORED, REQUEST, deps(fetchImpl, { endpoint: '' }));

    expect(result.kind).toBe('unchanged');
    // The app must make NO network request while refresh is switched off.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses to send a licence id over plain http', async () => {
    const fetchImpl = respond({});
    const result = await refreshLicense(
      STORED,
      REQUEST,
      deps(fetchImpl, { endpoint: 'http://licences.example/refresh' }),
    );

    expect(result).toEqual({ kind: 'unchanged', reason: 'endpoint is not https' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('licence refresh — the server is not trusted', () => {
  it('applies a newer licence that verifies', async () => {
    const fresh = licence({ issuedAt: '2026-06-01T00:00:00.000Z' });
    const result = await refreshLicense(STORED, REQUEST, deps(respond({ token: fresh })));

    expect(result).toEqual({ kind: 'updated', token: fresh, payload: expect.anything() });
  });

  it('applies a suspension, because it is signed', async () => {
    const suspended = licence({ issuedAt: '2026-06-01T00:00:00.000Z', state: 'suspended' });
    const result = await refreshLicense(STORED, REQUEST, deps(respond({ token: suspended })));

    expect(result.kind).toBe('updated');
    expect(result.kind === 'updated' && result.payload.state).toBe('suspended');
  });

  it('ignores an unsigned suspension in the response body', async () => {
    // The attack this prevents: whoever can spoof DNS or intercept the
    // connection puts a clinic into read-only mid-consultation.
    const result = await refreshLicense(
      STORED,
      REQUEST,
      deps(respond({ status: 'suspended', revoked: true })),
    );

    expect(result).toEqual({ kind: 'unchanged', reason: 'no token in response' });
  });

  it('ignores a licence signed by anyone else', async () => {
    const forger = generateKeyPairSync('ed25519');
    const forged = licence(
      { issuedAt: '2026-06-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z' },
      forger.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    );

    const result = await refreshLicense(STORED, REQUEST, deps(respond({ token: forged })));

    expect(result).toEqual({ kind: 'unchanged', reason: 'signature did not verify' });
  });

  it('refuses a replayed older licence', async () => {
    const old = licence({ issuedAt: '2025-01-01T00:00:00.000Z', state: 'suspended' });
    const result = await refreshLicense(STORED, REQUEST, deps(respond({ token: old })));

    // Capturing yesterday's suspension and replaying it forever must not work.
    expect(result).toEqual({ kind: 'unchanged', reason: 'not newer than the stored licence' });
  });

  it('refuses a licence issued at the same instant', async () => {
    const same = licence({ state: 'suspended' });
    const result = await refreshLicense(STORED, REQUEST, deps(respond({ token: same })));

    expect(result.kind).toBe('unchanged');
  });

  it('refuses a licence belonging to somebody else', async () => {
    const other = licence({ id: 'lic_9999', issuedAt: '2026-06-01T00:00:00.000Z' });
    const result = await refreshLicense(STORED, REQUEST, deps(respond({ token: other })));

    expect(result).toEqual({ kind: 'unchanged', reason: 'response is for a different licence' });
  });

  it('accepts a signed licence when the stored one is corrupt', async () => {
    const fresh = licence({ issuedAt: '2026-06-01T00:00:00.000Z' });
    const result = await refreshLicense(
      'NPL1.garbage.garbage',
      REQUEST,
      deps(respond({ token: fresh })),
    );

    // Anything genuinely signed is an improvement on an unusable file.
    expect(result.kind).toBe('updated');
  });
});

describe('licence refresh — what leaves the machine', () => {
  it('proves it holds the licence, rather than merely naming it', async () => {
    const fetchImpl = respond({});
    await refreshLicense(STORED, REQUEST, deps(fetchImpl));

    const sent = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    // The licence id is printed in Ajustes for support, so it is semi-public.
    // Keying a refresh on it alone would let anyone who saw a screenshot pull
    // a working licence.
    expect(sent.token).toBe(STORED);
    expect(sent).not.toHaveProperty('licenseId');
  });

  it('sends the current token, device id and app version, and nothing else', async () => {
    const fetchImpl = respond({});
    await refreshLicense(STORED, REQUEST, deps(fetchImpl));

    const init = fetchImpl.mock.calls[0]?.[1];
    const sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    // Threat model T-35. A field added here is a field about her practice
    // leaving her machine.
    expect(Object.keys(sent).sort()).toEqual(['appVersion', 'deviceId', 'token']);
    expect(sent).toEqual({ token: STORED, deviceId: 'dev-1', appVersion: '0.1.0' });
  });

  it('posts to the configured endpoint as JSON', async () => {
    const fetchImpl = respond({});
    await refreshLicense(STORED, REQUEST, deps(fetchImpl));

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://licences.example/refresh');
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('POST');
  });
});
