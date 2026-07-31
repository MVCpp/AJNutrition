/**
 * The issuer's Ed25519 PUBLIC key, base64 SPKI DER.
 *
 * Generate the pair with `node scripts/issue-license.mjs keygen`, paste the
 * public half here, and keep the private half out of this repository and out
 * of CI — it is the crown jewel (docs/product/subscription.md §5).
 *
 * While this is empty the subscription layer is INERT: status reports
 * `enforced: false`, nothing is ever gated, and the Ajustes panel stays
 * hidden. That is deliberate. Shipping the machinery must not be able to
 * expire an app that nobody is selling yet, and it means turning licensing on
 * is a one-line, reviewable change rather than a flag someone can flip at
 * runtime. It is NOT read from the environment for exactly that reason.
 */
export const LICENSE_PUBLIC_KEY = '';

/**
 * Licence refresh endpoint (phase S-2a). Empty disables it, which is the
 * default and the current state: with no endpoint the app makes no network
 * request of any kind, exactly as in S-1.
 *
 * Must be `https://`. The client refuses anything else even if this is
 * misconfigured, because the request carries a licence id.
 *
 * Refreshing is strictly opportunistic: it can only ever REPLACE the stored
 * licence with a newer signed one. It is never consulted to decide whether the
 * app may run, so an unreachable server, an expired domain or a shut-down
 * service can never stop a paid-up practitioner from working.
 */
export const LICENSE_REFRESH_ENDPOINT = '';
