# Gap Analysis

**Rewritten 2026-07-30.** The previous version was a snapshot taken after the
first implementation session on 2026-07-21 and was never updated; by the end it
listed Phases 2–7 as "not started" when all of them had shipped. A document
that describes the project wrongly is worse than no document, so this one
states what is true today and nothing else.

`docs/product/backlog.md` is the per-story record. This file answers a
different question: **what would stop this being used by a real practice
tomorrow.**

Status legend: ✅ done · 🟡 partial · ⬜ not started · 🚫 blocked on someone
other than the developer

---

## 1. The short answer

Everything the practice needs to run is built and tested. What remains is
**not code**: one smoke test on real Windows, two certificates, and six
business decisions.

| Blocker                                          | Status | Who unblocks it              |
| ------------------------------------------------ | ------ | ---------------------------- |
| S-113 packaged installer validated on Windows    | ⬜     | The user, ~10 minutes        |
| S-114 signed Windows + notarized macOS artifacts | 🚫     | Certificates / Apple account |
| Subscription S-2 (payments)                      | 🚫     | §7.4 and §7.6 decisions      |

**S-113 is the real gate.** Until a packaged build has been installed,
launched, used and uninstalled on real Windows, no real patient data may go
into this app (threat-model standing rule 3). Nothing else on this page
matters as much.

## 2. Foundation

| Capability                                                      | Status | Note                                                                       |
| --------------------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| pnpm workspace, strict TS, lint-enforced dependency direction   | ✅     | 9 packages                                                                 |
| Electron secure baseline (CSP, sandbox, permissions, fuses)     | ✅     | Fuse verification on a packaged build folded into S-113                    |
| Validated IPC (Zod `.strict()`, sender check, audited failures) | ✅     | 86 channels, each with a threat-model row                                  |
| SQLite + forward-only migrations + integrity check + downgrade  | ✅     | 31 migrations                                                              |
| At-rest encryption + key hierarchy (ADR-0006)                   | ✅     | Packaged-OS validation folded into S-113/S-114                             |
| Local auth, app lock, throttling, recovery key                  | ✅     | Timeout configurable in Ajustes                                            |
| Encrypted backup/restore + scheduled backups with retention     | ✅     | ADR-0011; fresh-machine restore tested                                     |
| Pre-upgrade snapshot + automatic rollback on failed migration   | ✅     | `docs/product/upgrades.md`                                                 |
| Redacted structured logging with supportCode correlation        | ✅     | JSONL, 30-day retention                                                    |
| i18next extraction                                              | ✅     | es base locale; main-process errors still translate via codes, not strings |
| CI on ubuntu/windows/macos                                      | ✅     | Doubles as early native-module validation                                  |
| E2E (Playwright for Electron)                                   | ✅     | 6 scenarios against the built bundle                                       |
| Component tests (Testing Library + happy-dom)                   | 🟡     | Patient form, consultation form, licence panel. See §4.                    |
| Windows packaged-installer validation                           | ⬜     | **S-113 — the gate.**                                                      |
| macOS DMG signed + notarized                                    | 🚫     | Needs a Mac and an Apple Developer account                                 |

**TanStack Router: not adopted, and no longer planned.** The 2026-07-21 note
said "introduce with the second screen". There are now eight, and `App.tsx`
keeps every section mounted and merely hides the inactive ones — deliberately,
so half-typed forms and open detail views survive switching tabs. A router
would have to preserve that or it would be a regression. Not a gap; a decision.

## 3. Clinical product

Phases 2–7 are complete. Rather than re-list the backlog, here is what a
practitioner cannot do:

- **Multi-user or multi-device.** One practitioner, one machine, no sync. This
  is architectural, not an oversight: shared data is the "Clinic tier" project
  described in subscription.md §6 (S-4), and it implies a threat model this app
  does not have.
- **Prescribe from SMAE reference values.** The equivalence _structure_ ships;
  the gram sizes and reference macros do not, because inventing clinical
  reference data would be indefensible. She enters her own, or imports a CSV.
- **Automatic updates.** No updater exists (T-15). Upgrades are a manual
  reinstall, protected by the pre-upgrade snapshot.
- **Delete anything clinical.** By design — archive and supersede, never
  destroy.

## 4. Honest weak spots

Not blockers, but the places where a regression would cost the most and the
tests are thinnest:

| Area                                    | Why it matters                                                                                                     | Cheapest fix                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Plan editor, measurement form           | The two most complex screens, with no component tests. Both compute numbers she acts on.                           | Component tests (harness exists) |
| Licence flow end to end                 | Unit + component tested; no E2E, because it would need test-only injection of an issuer key.                       | Accept, or a guarded E2E hook    |
| Main-process error messages             | Spanish strings live in main, not i18n. A second locale would strand them.                                         | Translate via codes at the edge  |
| Migration fixtures per released version | S-104 covers idempotence, not "v0.1 data opened by v0.9". No release has shipped yet, so this cost nothing so far. | Add a fixture at first release   |

A sweep of all 86 preload methods against renderer usage on 2026-07-30 found
exactly one unreachable capability (`consultation.deleteTemplate`), now wired.
This sweep has caught four shipped bugs; it is worth repeating after any slice
that adds an IPC channel.

## 5. Known environmental constraints

- **Dual-OS workflow.** The repo lives on `/mnt/c` and is edited from WSL, but
  Electron, the test runner and every build must be driven from Windows
  PowerShell — the Linux side has no Electron binary. Installing dependencies
  requires the `corepack pnpm add` → `node scripts/fix-native-electron.mjs`
  sequence, which prunes and then restores the `better-sqlite3` prebuild.
- **CI runs plain `pnpm exec vitest run`, not Electron.** A main-process module
  that imports `electron` at the top level passes locally (the local runner
  _is_ Electron) and fails CI with "Electron failed to install correctly".
  Keep testable main modules electron-free and inject the electron-facing part.
- pnpm `blockExoticSubdeps` relaxed for `@electron/node-gyp`, a git-resolved
  dependency of Electron Forge — accepted risk T-11, commit pinned by lockfile.
