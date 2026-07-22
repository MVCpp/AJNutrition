# Threat Model (STRIDE) — living document

Scope today: the implemented foundation (patient slice, IPC, SQLite). Re-review at every phase gate.

## Assets

Patient identity + clinical data (highest sensitivity) · practitioner credentials (future) · encryption keys (future) · audit log integrity · backups · application/update integrity · dependency chain.

## Threat actors

Casual local user · malicious local user / insider with device access · malware on workstation · thief with the device · malicious imported file (future) · compromised dependency · compromised update channel (future) · malicious AI content (future) · practitioner error.

## Analysis (implemented surface)

| ID | Threat (STRIDE) | Entry point | L | I | Control today | Status / residual risk |
|----|-----------------|------------|---|---|----------------|------------------------|
| T-01 | Renderer compromise escalates to Node/filesystem (E) | Renderer | M | H | `sandbox`, `contextIsolation`, no `nodeIntegration`, preload exposes business methods only, fuses disable RunAsNode/NODE_OPTIONS/inspect | Implemented; verify on packaged build (S-113/S-114) |
| T-02 | Malicious IPC payload (T) | IPC | M | H | Zod `.strict()` re-validation in main, sender-frame check, typed envelope, denied/failed calls audited | Implemented + tested |
| T-03 | Casual/malicious local user reads patient data (I) | Device | **H** | **H** | Passphrase-gated unlock (AuthManager); auto-lock on OS lock/suspend/idle; unlock throttling (4 free, exp. backoff to 300 s); privileged IPC throws while locked | Implemented + tested (2026-07-22); packaged-app validation pending (S-113/S-114) |
| T-04 | Device theft → DB file copied (I) | Disk | M | H | Full-DB encryption (ChaCha20-Poly1305 via SQLite3MC); scrypt→KEK→master-key hierarchy; keyfile tamper-checked (GCM + Zod); no-plaintext-on-disk test | Implemented + tested (ADR-0006). Residual: RAM contains keys while unlocked; swap/hibernation files out of scope |
| T-05 | Backup file copied/readable (I) | Backup | M | H | .ajnbackup container: payload double-encrypted (DB key + independent HKDF backup KEK), AAD-bound header, hash pre-check; tamper/forged-header/wrong-passphrase tests | Implemented + tested (ADR-0011) |
| T-06 | Error messages leak paths/SQL/stack to UI (I) | Error path | M | M | AppError envelope; unknown errors collapsed; internals only in `internalDetail` (log-bound) | Implemented; add log-redaction tests with logger (S-110) |
| T-07 | Audit log contains sensitive content (I) | Audit writes | M | M | Port contract forbids it; integration test asserts no email/phone in metadata | Implemented; extend test per new event type |
| T-08 | Arbitrary navigation / window-open / webview (S,E) | WebContents | L | H | `will-navigate` blocked, window-open denied, webview attach prevented, CSP meta + header | Implemented |
| T-09 | Renderer permission abuse (camera/mic/etc.) (E) | Session | L | M | Default-deny permission request + check handlers | Implemented; future features must opt in per-permission with purpose |
| T-10 | Supply-chain: malicious build scripts (T) | pnpm install | M | H | pnpm default-blocked build scripts; only 4 audited packages allowed (`allowBuilds`); lockfile committed | Implemented; add CI `pnpm audit` (S-111) |
| T-11 | Supply-chain: git-resolved `@electron/node-gyp` (T) | Forge dep tree | L | M | `blockExoticSubdeps: false` **accepted risk**, commit pinned by lockfile, documented in workspace yaml | Accepted; revisit when Forge publishes registry-only tree |
| T-12 | DB corruption → silent data loss (T,D) | SQLite | L | H | Startup `integrity_check` refuses to run + explains; migrations transactional; never auto-reset | Implemented; recovery UX arrives with backups |
| T-13 | Downgrade: old app opens newer schema (T) | Startup | L | M | `assertSchemaNotAhead` refuses with clear message (tested) | Implemented |
| T-14 | Duplicate submissions (double-click/replayed IPC) (T) | IPC | M | L | DB unique constraints + duplicate guard inside one transaction | Implemented for patients; keep pattern |
| T-15 | Update tampering / unsigned artifacts (T,S) | Future updater | — | H | No updater yet; fuses enable ASAR integrity + onlyLoadAppFromAsar | Deferred to Phase 8: signed artifacts (Win cert TBD — A-12; macOS notarization — S-114) |
| T-16 | LIKE-wildcard / SQL injection via search (T) | Search input | M | M | Parameterized queries only (Drizzle), LIKE wildcards escaped (tested) | Implemented |

| T-17 | Brute-force of unlock passphrase via UI (S) | Lock screen | M | M | Throttle file outside encrypted DB; correct passphrase also refused during delay; scrypt (128 MiB) bounds offline attempts on the keyfile | Implemented + tested |
| T-18 | Keyfile tampering/swap (T) | `security/keyfile.json` | L | M | Zod schema + AES-GCM AAD binding → INTEGRITY/ENCRYPTION errors; atomic writes prevent half-written files | Implemented + tested |
| T-19 | Lost passphrase + recovery key → permanent data loss (D) | Human | M | H | Recovery key shown once with explicit save confirmation; recovery use rotates key; irrecoverability warning in setup UI; encrypted backups restorable on any machine with the passphrase | Accepted by design; blast radius bounded by S-109 backups (implemented) |

## Standing rules

1. No raw SQL or file paths across IPC, ever.
2. New IPC handler ⇒ new row in this table + schema + audit behavior before merge.
3. Real patient data prohibited until the packaged apps (S-113/S-114) have been validated on real Windows/macOS. Backups (S-109) shipped 2026-07-22; the remaining gate is packaged-app verification.
4. No compliance claims (see assumptions A-11) without qualified legal review.
