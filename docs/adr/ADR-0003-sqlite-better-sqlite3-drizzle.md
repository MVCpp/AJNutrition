# ADR-0003: SQLite via better-sqlite3 + Drizzle ORM, embedded forward-only migrations

**Status:** Accepted (2026-07-21)

**Context:** Local-first single-user storage; transactional integrity is non-negotiable for clinical data.

**Decision:** better-sqlite3 (main process only), Drizzle ORM for typed queries, and a small in-repo migration runner with SQL embedded in TypeScript (`packages/database/src/migrations.ts`).

Key points:
- Migrations are the physical-schema source of truth; Drizzle definitions mirror them and integration tests (real migrations + Drizzle queries) catch drift. drizzle-kit codegen can be adopted later without changing this contract.
- Embedded SQL survives ASAR packaging; no runtime file resolution.
- Pragmas: WAL, `foreign_keys=ON`, `busy_timeout=5000`, `trusted_schema=OFF`.
- Startup: `integrity_check` + refusal to open newer-version schemas; failed migrations roll back and never reset data.

**Alternatives:** node:sqlite (too new/limited), sql.js (no real durability story), Prisma (heavy engine, poor Electron fit), drizzle-kit-managed migration files on disk (ASAR + upgrade fragility).

**Consequences / revisit:** Native module must be rebuilt per OS/ABI (Forge handles at package time; validate on Windows and macOS arm64). Encryption story decided separately in ADR-0006.
