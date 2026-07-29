# Subscription layer — design options and plan

Status: **draft for decision**. Nothing here is implemented. Written 2026-07-29.

This document exists because turning NutriPlan into a subscription product
touches the two things the whole architecture was built around: it runs
offline, and the data belongs to the practitioner. Getting the licensing model
wrong would undo both.

---

## 1. The constraint that decides everything

**A lapsed subscription must never lock a practitioner out of her patients'
records.**

Those records are clinical documents. She is required to keep them, patients
have a right to them, and they live on her machine, encrypted with her
passphrase. Holding them hostage over an unpaid invoice would be indefensible
— practically (she can restore a backup on any machine), ethically, and
probably legally.

So the product being sold is **the right to use the software and receive
updates**, not access to the data. That gives the only defensible degradation:

| State                | What works                                                     |
| -------------------- | -------------------------------------------------------------- |
| Trial / Active       | Everything                                                     |
| Grace (lapsed < N d) | Everything, with a visible reminder                            |
| Expired              | **Read-only**: open, search, view, export, back up, print PDFs |
| —                    | Never blocked: unlock, export, backup, restore                 |

Expired blocks _creating and editing_ — new patients, consultations, plans.
It never blocks reading or getting the data out. That is both the honest
position and the one that keeps her paying: the app stops being useful for
work immediately, without ever threatening her records.

## 2. Enforcement mechanism

Three realistic options:

**A. Online activation + periodic revalidation.** App calls a license server
on launch. Simple to revoke; useless in a consulting room with bad internet,
and makes the app dependent on infrastructure that must never go down.

**B. Signed license file, verified offline (recommended).** The server issues
a token — customer id, plan, `expiresAt`, issued-at — signed with Ed25519. The
app embeds the public key and verifies the signature locally. No network is
required to run. Renewal replaces the token.

**C. Full SaaS with server-side data.** Rejected. It would invert the entire
threat model, require handling patient data on someone else's infrastructure,
and put NutriPlan under obligations (breach notification, cross-border
transfer) that a solo developer should not take on.

**Recommendation: B, with an optional online refresh.** Verify offline
always; when the machine happens to be online, silently fetch a fresh token so
renewals apply without the practitioner doing anything. If the refresh fails,
nothing happens — the existing token is still valid until it expires.

Practical parameters to decide: token lifetime (suggest 35 days for monthly,
400 for annual — always longer than the billing period so a failed refresh is
invisible), grace period (suggest 14 days), trial length (suggest 30 days,
full features, no card).

### On piracy

Offline desktop software cannot be protected from a determined attacker, and
trying produces DRM that punishes paying customers. The goal is honest
friction: a signed token, a clear expiry, and a revocation list for
chargebacks. Someone who patches the binary was never going to pay.

## 3. What the app has to grow

- **License store**: the token file in `userData`, outside the encrypted
  database (it must be readable before unlock, to show status on the lock
  screen).
- **Verifier**: Ed25519 signature check + expiry, main process only, embedded
  public key. Pure and unit-testable, like the rest of `packages/security`.
- **State machine**: trial → active → grace → expired, with the clock read
  from the OS. Deliberate decision needed on clock tampering: setting the
  clock back extends grace. Detect the obvious case (stored "latest seen
  time" moving backwards) and accept the rest.
- **Enforcement point**: one guard in the IPC layer that refuses _write_
  commands when expired. It must be a single choke point — scattering checks
  through use cases guarantees one gets forgotten.
- **UI**: status in Ajustes, a banner in grace, a clear read-only explanation
  when expired, and a place to paste or load a new license file.
- **Device identity**: a random UUID generated on first run. **Not** a
  hardware fingerprint — those break on hardware changes and are a privacy
  problem. It exists to spot one licence running on twenty machines, nothing
  more.

### Threat-model consequences

This introduces the app's first non-AI outbound connection, so it needs new
rows in `docs/security/threat-model.md`:

- The license request may carry **only** licence key, app version and the
  random device id. Never patient counts, never usage data, never anything
  derived from the database.
- Renderer CSP stays `connect-src 'self'`; the call happens in main, like the
  AI provider call.
- A compromised or hostile license server must not be able to do anything
  worse than refuse a renewal — the token is verified by signature, so a
  malicious response cannot grant itself powers or inject content.

## 4. Money

**Payment provider.** For a Mexican practice buying in MXN:

- **Stripe** — subscriptions, MXN, cards, OXXO/SPEI via local payment methods,
  good API and webhooks. Does _not_ issue CFDI.
- **Mercado Pago** — strongest local coverage (OXXO, SPEI, MSI), weaker
  subscription tooling and developer experience.
- **Paddle / Lemon Squeezy** (merchant of record) — they handle VAT/IVA and
  are the seller of record, which removes most tax work, but CFDI for Mexican
  business customers is the open question.

**CFDI is the deciding factor, not the API.** A nutrition practice will ask
for a factura with her RFC to deduct the expense. If the provider cannot
produce a CFDI 4.0, that has to come from a Mexican invoicing service
(Facturama, Bind, Alegra) driven from the same webhook that issues the
licence.

> I am not a tax adviser. Confirm the CFDI, IVA and _retención_ treatment of
> recurring software sales with a contador before charging anyone. The
> difference between selling as a _persona física con actividad empresarial_
> and through a _persona moral_ changes both the obligations and the paperwork.

## 5. What you would be running

Subscription businesses fail on operations, not code. What has to exist:

- **License service**: small HTTPS API — issue, refresh, revoke — plus the
  signing key. The signing key is the crown jewel: if it leaks, every licence
  ever issued is forgeable. Keep it out of the repo and out of the CI
  environment.
- **Customer record**: email, RFC, plan, status, device ids, invoice history.
  Never patient data. This is the one system that must be backed up on your
  side rather than hers.
- **Webhook handling**: payment succeeded → issue/extend; payment failed →
  dunning; refund/chargeback → revoke. All of it idempotent, because
  providers retry.
- **Email**: licence delivery, renewal reminders, failed-payment sequence,
  cancellation confirmation.
- **Support runbook**: reissue a licence, move to a new computer, extend a
  trial, refund. Each of these is a button you need or a support ticket you
  answer manually at 9 pm.
- **Legal**: Términos de servicio, updated Aviso de privacidad (payment data
  is handled by the provider, patient data still never leaves her machine),
  cancellation and refund policy, PROFECO-compliant terms for consumer sales.

**Smallest thing that works**: a single serverless function plus a managed
database, driven entirely by Stripe webhooks, with the signing key in a
secrets manager. Not a platform — a hundred lines and a mailbox.

## 6. Phasing

**Phase S-1 — in-app licensing (no server).** Verifier, license store, state
machine, IPC write-guard, UI, threat-model rows. Licences issued by hand with
a CLI script. This is enough to sell to the first ten customers by email.

**Phase S-2 — payments.** Stripe Checkout, webhook → issue/extend/revoke,
licence email, trial flow.

**Phase S-3 — billing operations.** CFDI integration, dunning, refunds,
device transfers, support tooling.

**Phase S-4 — optional.** Update channel tied to subscription status; a
"Clinic" tier, which is a genuinely different product because it implies
multiple users and shared data — that is the sync/multi-tenancy project, not
a pricing change.

## 7. Decisions needed before S-1 starts

1. Price, and monthly vs annual (annual halves the operational load).
2. Trial length, and whether it needs a card.
3. Grace period, and what expired allows — the table in §1 is a proposal.
4. Provider, driven by the CFDI answer.
5. Whether the app may ever require internet. Recommendation: no, never.
6. Who is the seller of record — you personally, or a company.
