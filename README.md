# AJNutrition

Local-first desktop application for a nutrition professional: patient records, consultations, anthropometry, meal planning, and reporting. All clinical data stays on the local device; internet-dependent features are optional and explicit.

> ⚠️ **Status: secure foundation + first vertical slice.** Local authentication and at-rest encryption are not implemented yet — **do not enter real patient data** (see `docs/product/assumptions-register.md`, A-02).

## Stack

Electron (Forge + Vite) · React 19 · TypeScript strict · Tailwind 4 · TanStack Query · React Hook Form + Zod · SQLite (better-sqlite3 + Drizzle) · Vitest · pnpm workspace.

## Repository layout

```
apps/desktop        Electron app (main / preload / renderer)
packages/shared     IPC channels, Zod contracts, error model
packages/domain     Pure domain model (no frameworks)
packages/application  Use cases + ports
packages/database   SQLite connection, migrations, repositories
docs/               Product, architecture, security, ADRs
```

Dependency direction is enforced by ESLint + pnpm strict node_modules; see `docs/architecture/overview.md`.

## Development

Requirements: Node ≥ 22, pnpm ≥ 11.

```bash
pnpm install        # run ON the OS you develop on (see note below)
pnpm dev            # launch the app (Vite HMR)
pnpm typecheck      # all packages
pnpm lint
pnpm test           # vitest: domain, application, database (real SQLite)
```

**Per-OS install required:** `better-sqlite3` is a native module. `node_modules` produced under WSL/Linux will not work when launching from Windows (and vice versa). If you work in this repo from both environments, re-run `pnpm install` after switching.

## Packaging

```bash
pnpm --filter @ajnutrition/desktop make
```

- **Windows** (build on Windows): Squirrel installer `AJNutrition-Setup.exe` + ZIP.
- **macOS** (build on macOS): DMG + ZIP. Signing/notarization activate via env vars `AJN_OSX_SIGN=1`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` — never commit credentials. Unsigned builds are development builds.

Details and open items: `docs/adr/ADR-0009-packaging-targets.md`.

## Key documents

- `docs/product/gap-analysis.md` — what exists vs. what's required
- `docs/product/backlog.md` — prioritized epics (P0 = required for safe first use)
- `docs/architecture/overview.md` + `docs/architecture/erd.md`
- `docs/security/threat-model.md` — STRIDE analysis, accepted risks
- `docs/adr/` — architecture decision records

## Compliance

No claim of compliance with any law, health-record standard, or certification is made. See assumption A-11 and `SECURITY.md`.
