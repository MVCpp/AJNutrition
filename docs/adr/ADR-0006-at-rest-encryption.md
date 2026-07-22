# ADR-0006: At-rest encryption strategy

**Status:** PROPOSED — decision required before any real patient data (assumption A-02, threats T-03/T-04)

**Context:** SQLite file + future attachments must be unreadable if the device or a file copy is stolen. Two candidate strategies from the product brief.

**Option A — full-database encryption:** SQLCipher-compatible driver (e.g. better-sqlite3-multiple-ciphers). Pros: whole-file protection, simple mental model. Cons/unknowns: native packaging on Windows x64 **and** macOS arm64 with Forge; long-term maintenance of the fork; ADR-0004 port impact if the driver differs.

**Option B — field-level encryption:** AES-256-GCM envelopes (versioned: key id, nonce, tag) over sensitive columns + attachments, on top of plain better-sqlite3. Pros: no driver change; per-field classification; searchable non-sensitive columns. Cons: discipline-heavy (every new sensitive field must opt in), metadata (row existence, dates) stays visible.

**Key hierarchy (either option):**
`practitioner passphrase → Argon2id → KEK → unwraps master key (random 256-bit) → DB/field keys`. Master key wrapped copy stored locally; optionally additionally wrapped by OS secure storage (`safeStorage`: DPAPI on Windows, Keychain on macOS) for quick unlock — with documented behavior when OS storage is weak/unavailable (some Linux setups). Recovery key generated at setup; explicit warning that losing passphrase + recovery key means unrecoverable data.

**Decision procedure:** spike Option A packaging on real Windows and macOS during Phase 1 (S-108). If it packages and migrates cleanly on both, choose A; otherwise B. Record outcome here.
