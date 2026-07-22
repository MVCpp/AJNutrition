# Gap Analysis

Baseline: the repository was **empty** on 2026-07-21. Everything below compares the master requirements document against what exists after the first implementation session.

Status legend: ✅ implemented · 🟡 partial/scaffolded · ⬜ not started

## Foundation

| Capability | Status | Risk if missing | Recommendation | Priority |
|---|---|---|---|---|
| pnpm workspace, strict TS, ESLint dependency-direction rules | ✅ | — | Extend lint rules as packages appear | — |
| Modular monolith layering (shared/domain/application/database/app) | ✅ | — | Reference slice enforces direction | — |
| Electron secure baseline (contextIsolation, sandbox, CSP, permission deny, navigation lockdown, fuses) | ✅ | Renderer compromise → data theft | Verify fuses on a packaged build (needs real OS build) | P0 |
| Validated IPC with Zod + sender check + audit on failure | ✅ | Injection via IPC | Add rate limiting for expensive ops when they appear | P0 |
| SQLite + forward-only migrations + integrity check + downgrade refusal | ✅ | Silent data loss | Add migration fixture tests per released version from v0.2 on | P0 |
| Patient create/list/get vertical slice with 31 passing tests | ✅ | — | This is the architectural reference | — |
| **Local authentication + app lock** | ⬜ | Anyone at the PC reads patient data | Argon2id-based passphrase + inactivity lock; **gate for real data** | **P0** |
| **At-rest encryption + key hierarchy (ADR-0006)** | ⬜ | Stolen device = breach | Spike SQLCipher-compatible driver vs field-level AES-GCM on Win **and** macOS | **P0** |
| **Encrypted backup/restore (.ajnbackup container)** | ⬜ | Unrecoverable data loss | Manifest + hashes + independent encryption; restore preview | **P0** |
| Structured redacted local logging | ⬜ | Undiagnosable failures; support codes point nowhere | Small logger in main; supportCode correlation | P0 |
| Practitioner setup wizard + settings storage | ⬜ | — | Needed with auth | P0 |
| i18next extraction (UI is hard-coded Spanish) | 🟡 | Rework cost compounds | Extract before Phase 2 exit | P1 |
| TanStack Router | ⬜ | — | Introduce with the second screen | P1 |
| CI (GitHub Actions: typecheck, lint, test, audit, build) | ⬜ | Regressions land silently | First workflow next session | P0 |
| Component tests (Testing Library) + E2E (Playwright for Electron) | ⬜ | UI regressions | Add with auth flow (first real workflow to protect) | P1 |
| Windows packaged-installer validation (Squirrel, native module unpack) | ⬜ | Ship-blocker discovered late | Must run on real Windows; external `better-sqlite3` + plugin-vite packaging is a known rough edge — validate early | P0 |
| **macOS build: DMG/ZIP, signing, notarization, Keychain secure storage** | 🟡 | User-committed target (2026-07-21) | Forge config ready; requires a Mac + Apple Developer account; validate better-sqlite3 universal/arm64 rebuild, `safeStorage` Keychain behavior, Gatekeeper | **P0 for release, blocked on hardware/account** |

## Clinical product (Phases 2–7) — all ⬜

Patient clinical history, consents/privacy workflows, consultations (SOAP, signing, amendments), anthropometry + formula registry with provenance, laboratory tracking, food/nutrient datasets with manifests, recipes, meal-plan builder + live analysis, exchange/substitution engine, optimization engine, appointments/reminders, adherence/progress, PDF reporting, import/export, AI assistance. Sequenced in `docs/product/backlog.md`; none blocks the architectural foundation above.

## Known environmental constraints

- WSL2 on `/mnt/c`: installs/tests verified under Linux here; Electron GUI, Windows installer, and macOS artifacts were **not** produced in this environment (no Electron binary downloaded in WSL; per-OS `pnpm install` required).
- pnpm `blockExoticSubdeps` relaxed for `@electron/node-gyp` (git-resolved dep of Electron Forge) — documented in `pnpm-workspace.yaml` and the threat model; lockfile pins the commit.
