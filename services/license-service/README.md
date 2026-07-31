# Licence service and admin console

Issues NutriPlan licences, answers the desktop app's refresh calls, and gives
you one screen to suspend or reinstate a customer.

**It holds the signing key.** That single fact drives every design choice
below: zero npm dependencies at runtime, no build step, no framework, one
SQLite file. If this key leaks, every licence ever issued becomes forgeable
and the only remedy is shipping a new public key in a new build of the app.

## What it stores

Customers, licences, the random device ids each licence has been seen on, and
an append-only event log. **Nothing about patients** — there is nothing to
store, because that data never leaves the practitioner's machine and is
encrypted with her passphrase. There is no view here that could show it, and
there should never be one.

## Setup

**1. Generate the issuer key pair** (once, ever):

```bash
node scripts/issue-license.mjs keygen --out ~/nutriplan-issuer.key
```

Paste the printed public key into `apps/desktop/src/main/license-key.ts` and
rebuild the app. Put the private key in your host's secret store. It must not
go into this repository or into CI.

**2. Generate an admin password hash:**

```bash
pnpm --filter @ajnutrition/license-service hash-password
```

Reads from stdin, so the password never lands in shell history.

**3. Set the environment:**

| Variable              | What                                                   |
| --------------------- | ------------------------------------------------------ |
| `LICENSE_SIGNING_KEY` | base64 PKCS8 Ed25519 private key — **the crown jewel** |
| `LICENSE_PUBLIC_KEY`  | base64 SPKI Ed25519 public key (its pair)              |
| `ADMIN_PASSWORD_HASH` | output of step 2                                       |
| `SESSION_SECRET`      | any long random string                                 |
| `DB_PATH`             | default `./license.db`                                 |
| `PORT`                | default `8080`                                         |
| `INSECURE_COOKIES=1`  | local http runs only — never in production             |

**4. Run:**

```bash
pnpm --filter @ajnutrition/license-service start
```

or

```bash
docker build -f services/license-service/Dockerfile -t nutriplan-licences .
docker run -p 8080:8080 --env-file .env -v licences:/data nutriplan-licences
```

**5. Point the app at it.** Set `LICENSE_REFRESH_ENDPOINT` in
`apps/desktop/src/main/license-key.ts` to `https://<your host>/refresh` and
rebuild. Until you do, the app makes no network request at all.

## Deploying

It is a stateful single process with a SQLite file, so it wants a host with a
real disk: **Fly.io with a volume, Render with a persistent disk, or any small
VPS**. It is _not_ suited to a platform with an ephemeral filesystem, and it
does not need to be: it serves one request per customer per six hours.

Put it behind TLS — a reverse proxy or the platform's own termination. The
service does not terminate TLS itself, and the app refuses to send a licence
over plain `http://`.

**Back up `license.db`.** It is the entire business record, and it is the one
thing here that is not reproducible. The practitioner's clinical data is
_hers_ and backed up on her machine; this file is _yours_.

## Endpoints

| Path       | Auth    | Purpose                                 |
| ---------- | ------- | --------------------------------------- |
| `/refresh` | none    | The only endpoint the desktop app calls |
| `/healthz` | none    | Liveness                                |
| `/admin`   | session | The console                             |

`/refresh` is deliberately unauthenticated in the ordinary sense — the app has
no credential to present other than the licence it holds, and that **is** the
credential. Knowing a licence id is not enough, which matters because the id is
printed in the app's Ajustes screen for support and is therefore semi-public.

A refusal always returns `{}`. Distinguishing "unknown licence" from "revoked"
would turn the endpoint into an oracle for probing licence ids.

## What suspend, revoke and renew actually do

Everything is expressed as _issue a newer signed licence for the same id_,
because the app only ever honours the newest one it has seen.

- **Suspend** — issues a token whose signed state is `suspended`. The app drops
  to read-only on its next refresh. **The expiry is unchanged**: a suspension
  is a pause, not a forfeiture, so reinstating gives back exactly the time she
  paid for.
- **Reinstate** — issues an active token with the original expiry.
- **Renew** — issues a token with a fresh expiry.
- **Revoke** — terminal. The service stops answering refreshes for that
  licence. It is **not** a remote kill switch: the app keeps whatever token it
  holds and runs until that expires. A chargeback must not take a clinician's
  records away mid-consultation.

Read-only means read-only. Suspended and expired allow exactly the same things
— open, search, print, export, back up, unlock — and differ only in the message
shown. That holds even for suspected abuse.

## On "suspicious activity"

The only signal available is **one licence seen on several device ids**, shown
on the customer list and flagged past two. Device ids are random UUIDs the app
generates on first run; they are not hardware fingerprints and say nothing
about the machine.

Treat a flag as a prompt to look, never as grounds to suspend automatically. A
false positive means a nutritionist cannot write a note with a patient in front
of her.

Anything richer would need telemetry about how she uses the app, which would
undo the reason her patients' data is safe. That is a deliberate ceiling.

## Why there is no build step

The service runs its TypeScript directly via `node --experimental-strip-types`,
so what is deployed is exactly what is in the repository. Two consequences to
know about:

- Imports carry explicit `.ts` extensions (Node's ESM resolver requires them).
- No TypeScript that needs _emitting_ rather than _erasing_ — no parameter
  properties, no enums, no decorators. `tsc --noEmit` will not catch these;
  running the service will.

`src/tokens.ts` duplicates the token format from `@ajnutrition/security`
rather than importing it, because the workspace packages use extensionless
imports that Node cannot resolve. `tokens.test.ts` pays for that duplication by
asserting the two produce byte-identical tokens. **If that test fails, every
licence sold stops working — fix the implementations, do not relax the test.**
