import { verifyLicenseToken, type LicensePlan } from './license';

/**
 * Subscription state machine (docs/product/subscription.md §1 and §3).
 *
 * Pure: the clock, the stored record and the policy are all arguments. The
 * one rule this file exists to protect is that `canWrite === false` is the
 * ONLY consequence of a lapsed subscription. Nothing here can make reading,
 * exporting, backing up or unlocking conditional on anything.
 */

/** Full features, no card, no server. */
export const DEFAULT_TRIAL_DAYS = 30;
/** After expiry: everything still works, with a visible reminder. */
export const DEFAULT_GRACE_DAYS = 14;

/**
 * Ignore backwards clock movement smaller than this before calling it
 * tampering — daylight saving, an NTP correction and a laptop resuming with a
 * stale RTC all move the clock back by small amounts, routinely and honestly.
 */
const CLOCK_TAMPER_TOLERANCE_MS = 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `suspended` is the issuer switching a licence off before its expiry. It
 * grants exactly what `expired` grants — read-only — and never less: the
 * reason for withholding writes changes nothing about her right to open,
 * print, export and back up her patients' records.
 */
export type LicenseState = 'trial' | 'active' | 'grace' | 'expired' | 'suspended';

/** What is persisted next to the app, outside the encrypted database. */
export interface LicenseRecord {
  token: string | null;
  /** Stamped on first run, so a fresh install always gets its trial. */
  trialStartedAt: string | null;
  /** Latest instant the app has ever observed; only ever moves forwards. */
  lastSeenAt: string | null;
}

export interface LicensePolicy {
  trialDays: number;
  graceDays: number;
}

export const DEFAULT_LICENSE_POLICY: LicensePolicy = {
  trialDays: DEFAULT_TRIAL_DAYS,
  graceDays: DEFAULT_GRACE_DAYS,
};

export interface LicenseStatus {
  state: LicenseState;
  /** The single question the IPC guard asks. */
  canWrite: boolean;
  holder: string | null;
  plan: LicensePlan | null;
  licenseId: string | null;
  /** When the CURRENT state ends: trial end, licence expiry, or grace end. */
  endsAt: string | null;
  /** Whole days until `endsAt`, floored at 0. */
  daysRemaining: number;
  /** A token is stored but is not usable — forged, corrupt, or truncated. */
  invalidToken: boolean;
  /** The clock moved backwards; expiry is judged by the furthest time seen. */
  clockTampered: boolean;
}

function daysUntil(boundaryMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((boundaryMs - nowMs) / DAY_MS));
}

export function evaluateLicense(
  record: LicenseRecord,
  publicKeySpkiBase64: string,
  now: Date,
  policy: LicensePolicy = DEFAULT_LICENSE_POLICY,
): LicenseStatus {
  // Turning the clock back must not buy free months. Judging expiry by the
  // furthest instant ever seen costs an honest user nothing: the worst case is
  // that their subscription is measured from a time slightly ahead of now.
  const lastSeenMs = record.lastSeenAt ? Date.parse(record.lastSeenAt) : Number.NaN;
  const nowMs = now.getTime();
  const effectiveMs = Number.isNaN(lastSeenMs) ? nowMs : Math.max(nowMs, lastSeenMs);
  const clockTampered = !Number.isNaN(lastSeenMs) && lastSeenMs - nowMs > CLOCK_TAMPER_TOLERANCE_MS;

  if (record.token) {
    try {
      const payload = verifyLicenseToken(record.token, publicKeySpkiBase64);
      const expiresMs = Date.parse(payload.expiresAt);
      const graceEndsMs = expiresMs + policy.graceDays * DAY_MS;
      const common = {
        holder: payload.holder,
        plan: payload.plan,
        licenseId: payload.id,
        invalidToken: false,
        clockTampered,
      };
      // Checked before expiry and grace: a suspension is the issuer overriding
      // the dates, so a licence with months left still stops writing. It never
      // stops reading — same read-only floor as `expired`.
      if (payload.state === 'suspended') {
        return {
          ...common,
          state: 'suspended',
          canWrite: false,
          endsAt: payload.expiresAt,
          daysRemaining: 0,
        };
      }
      if (effectiveMs < expiresMs) {
        return {
          ...common,
          state: 'active',
          canWrite: true,
          endsAt: payload.expiresAt,
          daysRemaining: daysUntil(expiresMs, effectiveMs),
        };
      }
      if (effectiveMs < graceEndsMs) {
        return {
          ...common,
          state: 'grace',
          canWrite: true,
          endsAt: new Date(graceEndsMs).toISOString(),
          daysRemaining: daysUntil(graceEndsMs, effectiveMs),
        };
      }
      return {
        ...common,
        state: 'expired',
        canWrite: false,
        endsAt: payload.expiresAt,
        daysRemaining: 0,
      };
    } catch {
      // A token that does not verify is treated as no token at all: fall
      // through to the trial rules rather than locking her out on the strength
      // of a corrupted file. `invalidToken` tells the UI to say so.
      return { ...evaluateTrial(record, effectiveMs, policy, clockTampered), invalidToken: true };
    }
  }

  return evaluateTrial(record, effectiveMs, policy, clockTampered);
}

function evaluateTrial(
  record: LicenseRecord,
  effectiveMs: number,
  policy: LicensePolicy,
  clockTampered: boolean,
): LicenseStatus {
  const common = {
    holder: null,
    plan: null,
    licenseId: null,
    invalidToken: false,
    clockTampered,
  };
  const startedMs = record.trialStartedAt ? Date.parse(record.trialStartedAt) : Number.NaN;
  if (Number.isNaN(startedMs)) {
    // No trial stamp yet — the very first launch, before the manager writes
    // one. Treat it as a trial starting now rather than as expired.
    const endsMs = effectiveMs + policy.trialDays * DAY_MS;
    return {
      ...common,
      state: 'trial',
      canWrite: true,
      endsAt: new Date(endsMs).toISOString(),
      daysRemaining: policy.trialDays,
    };
  }
  const endsMs = startedMs + policy.trialDays * DAY_MS;
  if (effectiveMs < endsMs) {
    return {
      ...common,
      state: 'trial',
      canWrite: true,
      endsAt: new Date(endsMs).toISOString(),
      daysRemaining: daysUntil(endsMs, effectiveMs),
    };
  }
  return {
    ...common,
    state: 'expired',
    canWrite: false,
    endsAt: new Date(endsMs).toISOString(),
    daysRemaining: 0,
  };
}
