import { randomUUID } from 'node:crypto';
import { signToken, verifyToken, type TokenPayload } from './tokens.ts';
import type { Licence, Store } from './db.ts';

/**
 * Everything that mints or changes a licence.
 *
 * The single rule underneath all of it: the app only ever honours the NEWEST
 * signed licence it has seen. So every state change here — renewal, suspension,
 * reinstatement — is expressed the same way: issue a new token, with a fresh
 * `issuedAt`, for the same licence id. There is no other verb.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Always longer than the billing period, so a late renewal is invisible. */
export const DEFAULT_TOKEN_DAYS: Record<Licence['plan'], number> = {
  monthly: 35,
  annual: 400,
  perpetual: 36500,
};

export interface IssueOptions {
  customerId: string;
  holder: string;
  plan: Licence['plan'];
  days?: number;
  /** Reuse an existing id to REPLACE a licence rather than create one. */
  licenceId?: string;
  suspended?: boolean;
  now: Date;
}

export interface Signer {
  privateKey: string;
  publicKey: string;
}

/**
 * Mints a token and stores it. Used for the first issue, for renewals, for
 * suspensions and for reinstatements — they differ only in the arguments.
 */
export function issueLicence(store: Store, signer: Signer, options: IssueOptions): Licence {
  const id = options.licenceId ?? `lic_${randomUUID().slice(0, 8)}`;
  const days = options.days ?? DEFAULT_TOKEN_DAYS[options.plan];
  const issuedAt = options.now;
  const expiresAt = new Date(issuedAt.getTime() + days * DAY_MS);

  const payload: TokenPayload = {
    v: 1,
    id,
    holder: options.holder,
    plan: options.plan,
    ...(options.suspended === true ? { state: 'suspended' as const } : {}),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const licence: Licence = {
    id,
    customerId: options.customerId,
    plan: options.plan,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    status: options.suspended === true ? 'suspended' : 'active',
    token: signToken(payload, signer.privateKey),
    updatedAt: payload.issuedAt,
  };
  store.upsertLicence(licence);
  return licence;
}

/**
 * Re-issues an existing licence with a new state, keeping its expiry.
 *
 * Suspending does NOT shorten the licence. If she pays, reinstating restores
 * exactly the time she bought — a suspension is a pause, not a forfeiture.
 */
export function setLicenceSuspended(
  store: Store,
  signer: Signer,
  licence: Licence,
  suspended: boolean,
  holder: string,
  now: Date,
): Licence {
  const payload: TokenPayload = {
    v: 1,
    id: licence.id,
    holder,
    plan: licence.plan,
    ...(suspended ? { state: 'suspended' as const } : {}),
    // A new instant is what makes the app prefer this over what it holds.
    issuedAt: now.toISOString(),
    expiresAt: licence.expiresAt,
  };
  const updated: Licence = {
    ...licence,
    status: suspended ? 'suspended' : 'active',
    issuedAt: payload.issuedAt,
    token: signToken(payload, signer.privateKey),
    updatedAt: payload.issuedAt,
  };
  store.upsertLicence(updated);
  return updated;
}

export type RefreshResult =
  | { kind: 'token'; token: string; licenceId: string }
  /** Deliberately indistinguishable from each other to the caller. */
  | { kind: 'refused'; reason: string };

export interface RefreshInput {
  token: unknown;
  deviceId: unknown;
  appVersion: unknown;
}

/**
 * The public endpoint's decision. Pure apart from the store.
 *
 * The presented token is the credential: the licence id alone is printed in
 * the app's Ajustes screen and is therefore semi-public, so a refresh keyed on
 * it would hand a working licence to anyone who saw a screenshot.
 */
export function handleRefresh(
  store: Store,
  signer: Signer,
  input: RefreshInput,
  now: Date,
): RefreshResult {
  if (typeof input.token !== 'string' || input.token.length === 0) {
    return { kind: 'refused', reason: 'no token' };
  }
  // Bound the work an unauthenticated caller can ask for.
  if (input.token.length > 4096) return { kind: 'refused', reason: 'token too long' };
  const deviceId = typeof input.deviceId === 'string' ? input.deviceId.slice(0, 64) : '';
  const appVersion = typeof input.appVersion === 'string' ? input.appVersion.slice(0, 32) : '';

  const presented = verifyToken(input.token, signer.publicKey);
  if (presented === null) return { kind: 'refused', reason: 'token did not verify' };

  const licence = store.getLicence(presented.id);
  if (licence === null) return { kind: 'refused', reason: 'unknown licence' };

  const at = now.toISOString();
  if (deviceId !== '') {
    store.touchDevice(licence.id, deviceId, appVersion, at);
  }

  // A revoked licence gets nothing back. The app keeps whatever it holds and
  // runs until that expires — revocation is not a remote kill switch, and a
  // chargeback must not take a clinician's records away mid-consultation.
  if (licence.status === 'revoked') {
    store.record(at, licence.id, 'refresh.refused', 'licence revoked');
    return { kind: 'refused', reason: 'revoked' };
  }

  return { kind: 'token', token: licence.token, licenceId: licence.id };
}
