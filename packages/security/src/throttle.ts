/**
 * Unlock throttling policy (pure functions — the store persists the state).
 *
 * Attempts 1–4 are free (typos happen); attempt 5 onward imposes an
 * exponentially growing delay capped at 5 minutes. This blunts offline-style
 * guessing through the UI without locking the practitioner out of their own
 * data forever. (Someone with the raw files bypasses the UI entirely — that
 * attack is bounded by scrypt cost, not by this throttle.)
 */

export interface ThrottleState {
  failedCount: number;
  lastFailedAtIso: string | null;
}

export const INITIAL_THROTTLE_STATE: ThrottleState = { failedCount: 0, lastFailedAtIso: null };

const FREE_ATTEMPTS = 4;
const BASE_DELAY_SECONDS = 15;
const MAX_DELAY_SECONDS = 300;

export function delayForFailedCount(failedCount: number): number {
  if (failedCount <= FREE_ATTEMPTS) return 0;
  const exponent = failedCount - FREE_ATTEMPTS - 1;
  return Math.min(MAX_DELAY_SECONDS, BASE_DELAY_SECONDS * 2 ** exponent);
}

/** Seconds the caller must still wait before the next attempt is allowed. */
export function remainingDelaySeconds(state: ThrottleState, now: Date): number {
  if (state.lastFailedAtIso === null) return 0;
  const requiredDelay = delayForFailedCount(state.failedCount);
  if (requiredDelay === 0) return 0;
  const elapsed = (now.getTime() - new Date(state.lastFailedAtIso).getTime()) / 1000;
  return Math.max(0, Math.ceil(requiredDelay - elapsed));
}

export function recordFailure(state: ThrottleState, now: Date): ThrottleState {
  return { failedCount: state.failedCount + 1, lastFailedAtIso: now.toISOString() };
}
