# ADR-0006: At-rest encryption strategy

**Status:** ACCEPTED (2026-07-22) — Option A, with two amendments. Packaged-app validation on real Windows and macOS remains an explicit release-gate item (S-113/S-114).

**Context:** SQLite file + future attachments must be unreadable if the device or a file copy is stolen (threats T-03/T-04). Options evaluated: (A) full-database encryption via an SQLCipher-compatible driver; (B) field-level AES-GCM envelopes over sensitive columns.

**Decision: Option A — `better-sqlite3-multiple-ciphers` (ChaCha20-Poly1305 cipher).**

Empirically validated in this repo (`packages/database/src/encryption.test.ts`): raw file contains no plaintext and no cleartext SQLite header; correct key round-trips through close/reopen with WAL; wrong key is rejected (`SQLITE_NOTADB`) without damaging the original file. The driver is API-compatible with better-sqlite3, so the synchronous ports of ADR-0004 are untouched.

**Amendment 1 — KDF is scrypt, not Argon2id.** Every Node Argon2 implementation is another native module — additional packaging risk across Windows x64 / macOS arm64. scrypt is built into `node:crypto`, memory-hard, and OWASP-accepted at N=2^17, r=8, p=1 (128 MiB). Parameters are stored in the keyfile for future upgrades.

**Amendment 2 — key hierarchy** (implemented in `@ajnutrition/security`):

```text
passphrase ──scrypt──▶ KEK ──AES-256-GCM unwrap──▶ master key (random 256-bit)
recovery key (random 256-bit, shown once) ──HKDF──▶ second unwrap slot
master key ──HKDF('ajnutrition/db-key/v1')──▶ SQLite database key
```

- Keyfile (`userData/security/keyfile.json`): versioned envelopes with AAD context binding, atomic writes, Zod-validated on load; corrupt/tampered → INTEGRITY error.
- Recovery-key use forces a passphrase reset and rotates the recovery key.
- Losing passphrase **and** recovery key ⇒ data permanently unrecoverable (by design; stated in setup UI).
- The DB key is passed as a 64-hex high-entropy key string; the cipher's internal KDF stretches it once at open. `safeStorage`-based quick unlock (DPAPI/Keychain) is a follow-up, not part of this decision.

**Consequences:** whole-file protection incl. indexes/WAL; single decrypt boundary; future backups encrypt independently (S-109). Attachments (Phase 2) will use the envelope module from `@ajnutrition/security` with per-file keys derived from the master key.

**Revisit if:** the driver fork stalls against upstream better-sqlite3, or packaged-app validation fails on either OS (fallback: Option B, whose envelope primitives are already implemented and tested).
