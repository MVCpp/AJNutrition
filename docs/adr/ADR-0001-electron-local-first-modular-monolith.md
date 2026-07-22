# ADR-0001: Electron, local-first, modular monolith

**Status:** Accepted (2026-07-21)

**Context:** One nutrition professional, desktop-only, clinical data that must work offline and stay on-device (mandated in the product brief). Windows first; macOS committed as a build target on 2026-07-21. Team skill set: TypeScript/React.

**Decision:** Electron desktop app; all data local (SQLite in the user data dir); a single modular-monolith codebase split into layered workspace packages (`shared → domain → application → database → app`) with lint- and package-manifest-enforced dependency direction.

**Alternatives:** Tauri (smaller footprint, but Rust core + weaker ecosystem fit for this team and mandated stack); web SaaS (violates offline/local-data requirements); microservices (absurd for a single-user desktop app).

**Consequences:** ~100 MB installer and Chromium memory cost, accepted. Cross-platform path to macOS/Linux preserved. Security burden shifts to Electron hardening (see threat model). Modules can be extracted later because boundaries are explicit interfaces.

**Security impact:** Large attack surface (Chromium) mitigated by the baseline in `src/main/security.ts` + fuses. **Operational impact:** per-OS native module builds. **Revisit if:** multi-user/clinic sync becomes a requirement (would introduce a sync boundary, not a rewrite).
