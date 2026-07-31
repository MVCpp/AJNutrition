import type { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api';
import { LICENSE_KEY } from './useLicense';

/**
 * Keeps the licence UI honest the moment a write is refused.
 *
 * The status query polls slowly — it reads a local file describing something
 * that changes at the speed of days. But the transition into `expired` is the
 * one moment the UI must be loudest, and without this the practitioner gets a
 * refusal message while the banner stays hidden and Ajustes still claims the
 * subscription is fine, for up to a full poll interval.
 *
 * Wired once into the QueryClient's caches rather than at every call site:
 * the main process refuses writes at a single choke point, and the renderer
 * should react at a single one too.
 */

/** True when this failure is the subscription write-gate refusing a command. */
export function isLicenseRefusal(error: unknown): boolean {
  return error instanceof ApiError && error.detail.code === 'LICENSE';
}

/**
 * The status query itself is never gated (`license-gate.ts` classifies it
 * `always`), so it cannot produce a LICENSE error — but skipping it anyway
 * means a future misclassification degrades to a stale banner instead of an
 * invalidation loop.
 */
function isLicenseQuery(queryKey: readonly unknown[] | undefined): boolean {
  return queryKey?.[0] === LICENSE_KEY[0];
}

export function refreshLicenseOnRefusal(
  queryClient: QueryClient,
  error: unknown,
  queryKey?: readonly unknown[],
): void {
  if (!isLicenseRefusal(error)) return;
  if (isLicenseQuery(queryKey)) return;
  void queryClient.invalidateQueries({ queryKey: LICENSE_KEY });
}
