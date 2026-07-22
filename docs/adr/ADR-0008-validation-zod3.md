# ADR-0008: Zod v3 at every trust boundary

**Status:** Accepted (2026-07-21)

**Decision:** Zod schemas validate renderer forms, IPC payloads (re-validated in main), and — as they appear — file imports, settings, backup manifests, and AI outputs. Pinned to the v3 line (`^3.25`) for its long-stable API; error messages are stable machine codes (`date_in_future`) translated in the UI layer, keeping schemas locale-free. Migration to Zod v4 is a contained, mechanical upgrade tracked for a maintenance window — not worth the churn mid-foundation.

**Alternatives:** valibot (smaller, younger ecosystem), TypeBox/AJV (JSON-Schema-centric, weaker TS inference ergonomics for this stack).
