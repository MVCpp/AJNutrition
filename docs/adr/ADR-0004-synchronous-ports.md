# ADR-0004: Synchronous repository/use-case ports

**Status:** Accepted (2026-07-21)

**Context:** better-sqlite3 is synchronous and its `transaction()` cannot span async callbacks. A Promise-based port over a sync driver would be decorative and would make it impossible to compose repository calls + audit writes inside one real transaction.

**Decision:** `PatientRepository`, `AuditLog`, `UnitOfWork.run`, and use-case `execute` are synchronous. The async boundary is exactly one layer: the IPC handler (renderer always sees Promises via `ipcRenderer.invoke`).

**Alternatives:** async ports with a sync adapter (dishonest types); moving DB to a worker with async messaging (real option later for heavy work — imports/PDFs will use utility processes, not the core CRUD path).

**Consequences:** Long-running DB work would block the main process — acceptable for CRUD-scale operations; anything expensive goes to a utility process by design. **Revisit if:** an async driver (e.g. SQLCipher variant chosen in ADR-0006) forces it — that would be one deliberate, type-checked migration of the port signatures.
