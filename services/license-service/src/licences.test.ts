import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { evaluateLicense, signLicenseToken, verifyLicenseToken } from '@ajnutrition/security';
import { Store } from './db.ts';
import { handleRefresh, issueLicence, setLicenceSuspended, type Signer } from './licences.ts';

const pair = generateKeyPairSync('ed25519');
const signer: Signer = {
  privateKey: pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  publicKey: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
};

const at = (iso: string) => new Date(iso);
const NOW = at('2026-07-31T12:00:00.000Z');

let store: Store;

beforeEach(() => {
  store = new Store(':memory:');
  store.createCustomer({
    id: 'cus_1',
    name: 'Ana Jiménez',
    email: 'ana@example.com',
    rfc: null,
    notes: null,
    createdAt: NOW.toISOString(),
  });
});
afterEach(() => store.close());

const issue = (overrides = {}) =>
  issueLicence(store, signer, {
    customerId: 'cus_1',
    holder: 'Ana Jiménez',
    plan: 'annual',
    now: NOW,
    ...overrides,
  });

/** What the desktop app would conclude from a token. */
const appSees = (token: string, now: Date) =>
  evaluateLicense({ token, trialStartedAt: null, lastSeenAt: null }, signer.publicKey, now);

describe('issuing', () => {
  it('mints a token the desktop app accepts', () => {
    const licence = issue();

    expect(verifyLicenseToken(licence.token, signer.publicKey).id).toBe(licence.id);
    expect(appSees(licence.token, NOW).state).toBe('active');
    expect(appSees(licence.token, NOW).canWrite).toBe(true);
  });

  it('gives a token longer than the billing period, so a late renewal is invisible', () => {
    const monthly = issue({ plan: 'monthly' });
    const days = (Date.parse(monthly.expiresAt) - Date.parse(monthly.issuedAt)) / 86_400_000;

    expect(days).toBeGreaterThan(31);
  });

  it('renewing reuses the id, so the customer never re-registers', () => {
    const first = issue();
    const renewed = issueLicence(store, signer, {
      customerId: 'cus_1',
      holder: 'Ana Jiménez',
      plan: 'annual',
      licenceId: first.id,
      now: at('2027-06-01T00:00:00.000Z'),
    });

    expect(renewed.id).toBe(first.id);
    expect(store.listLicences()).toHaveLength(1);
    expect(Date.parse(renewed.expiresAt)).toBeGreaterThan(Date.parse(first.expiresAt));
  });
});

describe('suspending', () => {
  it('puts the app into read-only without touching what she paid for', () => {
    const licence = issue();
    const suspended = setLicenceSuspended(
      store,
      signer,
      licence,
      true,
      'Ana Jiménez',
      at('2026-08-01T00:00:00.000Z'),
    );

    // Expiry is unchanged: a suspension is a pause, not a forfeiture. If she
    // pays, reinstating gives back exactly the time she bought.
    expect(suspended.expiresAt).toBe(licence.expiresAt);

    const seen = appSees(suspended.token, at('2026-08-02T00:00:00.000Z'));
    expect(seen.state).toBe('suspended');
    expect(seen.canWrite).toBe(false);
  });

  it('is newer than the licence it replaces, or the app would ignore it', () => {
    const licence = issue();
    const suspended = setLicenceSuspended(
      store,
      signer,
      licence,
      true,
      'Ana Jiménez',
      at('2026-08-01T00:00:00.000Z'),
    );

    // The whole mechanism rests on newest-signed-wins.
    expect(Date.parse(suspended.issuedAt)).toBeGreaterThan(Date.parse(licence.issuedAt));
  });

  it('reinstating restores writing and the original expiry', () => {
    const licence = issue();
    const suspended = setLicenceSuspended(
      store,
      signer,
      licence,
      true,
      'Ana',
      at('2026-08-01T00:00:00.000Z'),
    );
    const back = setLicenceSuspended(
      store,
      signer,
      suspended,
      false,
      'Ana',
      at('2026-08-05T00:00:00.000Z'),
    );

    expect(back.expiresAt).toBe(licence.expiresAt);
    expect(appSees(back.token, at('2026-08-06T00:00:00.000Z')).canWrite).toBe(true);
  });
});

describe('the refresh endpoint', () => {
  const request = (token: unknown, deviceId = 'dev-1') => ({
    token,
    deviceId,
    appVersion: '0.1.0',
  });

  it('returns the current token to a caller holding a valid one', () => {
    const licence = issue();
    const result = handleRefresh(store, signer, request(licence.token), NOW);

    expect(result).toEqual({ kind: 'token', token: licence.token, licenceId: licence.id });
  });

  it('hands back the suspension after an admin suspends', () => {
    const licence = issue();
    setLicenceSuspended(store, signer, licence, true, 'Ana', at('2026-08-01T00:00:00.000Z'));

    // The app still presents its OLD token; the service answers with the new
    // one. That is the entire deactivation path.
    const result = handleRefresh(
      store,
      signer,
      request(licence.token),
      at('2026-08-02T00:00:00.000Z'),
    );

    expect(result.kind).toBe('token');
    const token = result.kind === 'token' ? result.token : '';
    expect(appSees(token, at('2026-08-02T00:00:00.000Z')).state).toBe('suspended');
  });

  it('refuses a caller who only knows the licence id', () => {
    const licence = issue();
    // The id is printed in Ajustes, so it is semi-public. Knowing it must not
    // be enough to obtain a working licence.
    const result = handleRefresh(store, signer, request(licence.id), NOW);

    expect(result.kind).toBe('refused');
  });

  it.each([
    ['nothing', undefined],
    ['a number', 42],
    ['an empty string', ''],
    ['gibberish', 'NPL1.aaa.bbb'],
    ['a very long string', 'x'.repeat(5000)],
  ])('refuses a request presenting %s', (_label, token) => {
    expect(handleRefresh(store, signer, request(token), NOW).kind).toBe('refused');
  });

  it('refuses a token signed by somebody else', () => {
    const forger = generateKeyPairSync('ed25519');
    const forged = signLicenseToken(
      {
        v: 1,
        id: 'lic_forged',
        holder: 'Ana',
        plan: 'perpetual',
        issuedAt: NOW.toISOString(),
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
      forger.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    );

    expect(handleRefresh(store, signer, request(forged), NOW).kind).toBe('refused');
  });

  it('refuses a genuine token for a licence this service never issued', () => {
    const stray = signLicenseToken(
      {
        v: 1,
        id: 'lic_unknown',
        holder: 'Ana',
        plan: 'annual',
        issuedAt: NOW.toISOString(),
        expiresAt: '2027-01-01T00:00:00.000Z',
      },
      signer.privateKey,
    );

    expect(handleRefresh(store, signer, request(stray), NOW).kind).toBe('refused');
  });

  it('gives a revoked licence nothing, and does not take away what it holds', () => {
    const licence = issue();
    store.upsertLicence({ ...licence, status: 'revoked', updatedAt: NOW.toISOString() });

    const result = handleRefresh(store, signer, request(licence.token), NOW);

    // Refused, not "here is a suspension": revocation stops renewals, it is
    // not a remote kill switch. The app runs on until its token expires.
    expect(result.kind).toBe('refused');
    expect(appSees(licence.token, NOW).canWrite).toBe(true);
  });

  it('records the machines a licence is seen on', () => {
    const licence = issue();
    handleRefresh(store, signer, request(licence.token, 'dev-a'), NOW);
    handleRefresh(store, signer, request(licence.token, 'dev-b'), NOW);
    handleRefresh(store, signer, request(licence.token, 'dev-a'), NOW);

    // Two machines, not three requests — the only sharing signal available.
    expect(store.deviceCount(licence.id)).toBe(2);
  });

  it('survives a request with no device id at all', () => {
    const licence = issue();
    const result = handleRefresh(
      store,
      signer,
      { token: licence.token, deviceId: null, appVersion: null },
      NOW,
    );

    expect(result.kind).toBe('token');
    expect(store.deviceCount(licence.id)).toBe(0);
  });
});
