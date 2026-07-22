# ADR-0002: Electron Forge + Vite + React 19 + strict TypeScript + pnpm

**Status:** Accepted (2026-07-21)

**Context:** Mandated baseline in the product brief; needed a packaging story for Windows + macOS and a fast dev loop.

**Decision:** Electron Forge 7 with `@electron-forge/plugin-vite` (main/preload/renderer builds), React 19, TS 5.8 strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`), pnpm workspace with source-based internal packages (packages export TS source; Vite/tsc consume it directly — no per-package build step, no stale dist drift).

**Alternatives:** electron-builder (more mature makers, but Forge is the officially maintained path and integrates fuses/vite plugins first-party); webpack template (slower, legacy).

**Consequences:** plugin-vite has a known rough edge: externalized native modules (better-sqlite3) need packaging validation (tracked S-113). Source-based packages mean the app bundles everything — fine at this scale.

**Security impact:** Fuses plugin wired at packaging time. **Revisit if:** package count or build times grow enough to justify per-package builds.
