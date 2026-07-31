import { verifyLicenseToken, type LicensePayload } from '@ajnutrition/security';

/**
 * Opportunistic licence refresh (docs/product/subscription.md, phase S-2a).
 *
 * The rules this file exists to enforce, in priority order:
 *
 *  1. **Offline is never a failure.** No network, DNS down, server down, a
 *     captive portal, a 500 — every one of them leaves the stored licence
 *     exactly as it was. A consulting room with bad wifi must behave like a
 *     consulting room with no wifi: fine.
 *  2. **The server returns licences, never commands.** A suspension is a
 *     signed token whose state says `suspended`. If it were an unsigned JSON
 *     field, anyone able to spoof DNS or intercept the connection could put a
 *     clinic into read-only — a denial of service against a clinician
 *     mid-consultation, which is a worse outcome than an unpaid month.
 *  3. **Newest signed licence wins.** Replaying an old suspension, or an old
 *     generous licence, is refused by comparing `issuedAt`.
 *  4. **The request says nothing about the practice.** Licence id, device id,
 *     app version. Never patient counts, never usage, never anything derived
 *     from the database (threat model T-35).
 *
 * Imports nothing from `electron`, and `fetch` is injected, so CI can run this
 * under plain node with no network.
 */

/**
 * Exactly what may leave the machine. Adding a field here needs T-35 re-read.
 *
 * The current token is the credential, NOT the licence id. The id is printed
 * in Ajustes so she can quote it to support, which makes it semi-public — a
 * refresh keyed on the id alone would let anyone who saw a screenshot pull a
 * working licence. The token is already on this machine and already came from
 * this service, so returning it discloses nothing new.
 */
export interface LicenseRefreshRequest {
  deviceId: string;
  appVersion: string;
}

export interface LicenseRefreshDeps {
  /** Absolute https:// endpoint. Empty string disables refresh entirely. */
  endpoint: string;
  publicKey: string;
  appVersion: string;
  fetchImpl?: typeof fetch;
  /** Bounded so a hanging server cannot delay startup. */
  timeoutMs?: number;
  now?: () => Date;
  /**
   * Flat scalars only, matching the logger's `LogMeta`. That shape is not an
   * accident: redaction walks a one-level map, so a nested object could carry
   * an unredacted string past it.
   */
  log?: (event: string, detail?: Record<string, string | number | boolean>) => void;
}

export type LicenseRefreshOutcome =
  /** A newer signed licence arrived and should replace the stored one. */
  | { kind: 'updated'; token: string; payload: LicensePayload }
  /** Nothing to do: unreachable, disabled, unchanged, or not newer. */
  | { kind: 'unchanged'; reason: string };

const DEFAULT_TIMEOUT_MS = 8000;

function unchanged(reason: string): LicenseRefreshOutcome {
  return { kind: 'unchanged', reason };
}

/**
 * Asks the licence service for a fresh token. Resolves — never rejects.
 * Every failure path is `unchanged`, because there is no failure here that
 * should cost the practitioner anything.
 */
export async function refreshLicense(
  currentToken: string,
  request: LicenseRefreshRequest,
  deps: LicenseRefreshDeps,
): Promise<LicenseRefreshOutcome> {
  if (deps.endpoint === '') return unchanged('refresh disabled');
  // Refuse to send a licence id over anything but TLS, even if someone
  // misconfigures the endpoint constant.
  if (!deps.endpoint.startsWith('https://')) return unchanged('endpoint is not https');

  const doFetch = deps.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') return unchanged('no fetch available');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let body: unknown;
  try {
    const response = await doFetch(deps.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: currentToken.trim(),
        deviceId: request.deviceId,
        appVersion: request.appVersion,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return unchanged(`http ${response.status}`);
    body = await response.json();
  } catch (err) {
    // Offline, DNS failure, TLS failure, timeout, malformed JSON — all the
    // same answer: carry on with what we have.
    deps.log?.('license.refresh.unreachable', { detail: String(err) });
    return unchanged('unreachable');
  } finally {
    clearTimeout(timer);
  }

  const token = (body as { token?: unknown } | null)?.token;
  if (typeof token !== 'string' || token === '') return unchanged('no token in response');

  let payload: LicensePayload;
  try {
    // The ONLY thing that makes a response authoritative. A hostile or
    // compromised server cannot do worse than refuse to answer.
    payload = verifyLicenseToken(token, deps.publicKey);
  } catch (err) {
    deps.log?.('license.refresh.rejected', { detail: String(err) });
    return unchanged('signature did not verify');
  }

  let current: LicensePayload | null = null;
  try {
    current = verifyLicenseToken(currentToken, deps.publicKey);
  } catch {
    // The stored token is unusable, so anything genuinely signed is an
    // improvement on it.
    current = null;
  }

  if (current !== null) {
    if (payload.id !== current.id) return unchanged('response is for a different licence');
    // Strictly newer, so replaying a captured older licence — generous or
    // suspended — changes nothing.
    if (Date.parse(payload.issuedAt) <= Date.parse(current.issuedAt)) {
      return unchanged('not newer than the stored licence');
    }
  }

  return { kind: 'updated', token: token.trim(), payload };
}
