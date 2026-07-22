# ADR-0011: Encrypted backup container (.ajnbackup)

**Status:** Accepted (2026-07-22)

**Context:** S-109 — after ADR-0006, the loss scenario (disk failure, forgotten passphrase, machine replacement) outweighed the breach scenario. A backup must restore on a **brand-new machine** with nothing but the file and the passphrase, and must never become readable merely by copying it (§9.4 of the product brief).

**Decision:** Custom binary container, `AJNutrition_Backup_YYYY-MM-DD_HHmm.ajnbackup`:

```text
MAGIC 'AJNBCKP1' (8) ┃ header length (4, LE) ┃ header JSON ┃ payload ciphertext
```

- **Payload** = `VACUUM INTO` snapshot of the live DB (empirically verified: the snapshot stays encrypted with the DB key and is consistent under WAL), wrapped **again** with AES-256-GCM under a per-backup KEK = HKDF(master key, fresh 32-byte salt) — independent of the live database key, satisfying "backups encrypted independently".
- **Header** carries: format/app/schema versions, creation timestamp, optional description, payload SHA-256, encryption metadata (salt, nonce, tag), and **the keyfile itself**. The keyfile is safe to embed — it contains only scrypt-bound envelopes — and makes the container self-sufficient: restore = container keyfile + passphrase → master key → payload. The passphrase is never stored.
- **Integrity is layered:** SHA-256 pre-check (no secret needed) → GCM tag authenticates the ciphertext → GCM AAD binds the header fields (format/created/app/schema/salt), so a forged header fails decryption even if the hash is recomputed to match (covered by test).
- **Snapshot is verified before packaging** (opens with the DB key + `integrity_check`): a bad backup is a retry at creation time, not a disaster at restore time.
- **Restore is staged and transactional:** parse → hash check → unwrap master from the container's keyfile (wrong passphrase feeds the same throttle as unlock — no guessing side-channel) → decrypt → stage → open + integrity + refuse newer schema/format → atomic swap keeping `.pre-restore` rollback copies of the DB and keyfile → app opens unlocked with the restored state.
- **Renderer never sees paths:** native dialogs run in main; preview issues a single-use token that restore consumes.

**Alternatives:** ZIP + encrypted entries (weaker integrity story, format ambiguity); age/GPG (external tooling, no header metadata for preview); cloud sync (explicitly out of scope for v1, §24).

**Consequences:** container is built in memory — fine for single-practitioner DB sizes; revisit with streaming if attachments grow databases beyond a few hundred MB. Automatic scheduled backups and retention policies build on this format (P1). Failed restore attempts before unlock cannot be audited to the DB; the throttle file counts them (ADR-0010 pattern).
