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
