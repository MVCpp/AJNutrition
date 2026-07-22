# ADR-0007: Audit log design

**Status:** Accepted (2026-07-21)

**Decision:** Append-only `audit_events` table written through the `AuditLog` port. Success events are written **inside** the same transaction as the change they describe (atomically true); failure/denied events are written best-effort outside it (a rolled-back transaction must still leave a failure trace). No foreign key to audited entities — audit history must survive entity deletion. Metadata is a sanitized flat map; the port contract (and an integration test) forbids clinical content, contact details, secrets, and full exports. `actor` is fixed to `practitioner` until local auth (S-106) introduces real actor identity; audit-log integrity protection (hash chaining) is deliberately deferred and will be reconsidered with the encryption work.

**Alternatives:** file-based log (loses transactional coupling); hash-chained tamper-evident log now (premature before key management exists).
