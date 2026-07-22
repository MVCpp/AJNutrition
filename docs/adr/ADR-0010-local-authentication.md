# ADR-0010: Local authentication and application locking

**Status:** Accepted (2026-07-22)

**Context:** S-106/S-107 — patient data must not be readable just because someone can open the computer. Single practitioner, offline; there is no server to defer to.

**Decision:** Authentication _is_ key custody: "logged in" means the master key is unwrapped in main-process memory and the encrypted DB is open. There is no separate password check to bypass — a wrong passphrase simply fails to unwrap (AES-GCM tag), so UI and cryptography cannot disagree.

- **State machine** (`AuthManager`, Electron-free, fully tested): `setup-required → locked ⇄ unlocked`. The DI container (DB handle, repositories, use cases) exists only while unlocked; `lock()` closes the DB and zeroes the master key buffer.
- **IPC gating:** privileged handlers reach the container only through `auth.getContainer()`, which throws AUTHORIZATION while locked. Auth channels themselves take `{}`-strict or passphrase payloads; passphrases cross IPC once per action, are never echoed, stored, or logged.
- **Throttling:** 4 free attempts, then 15 s doubling to a 300 s cap, persisted in `security/throttle.json` _outside_ the encrypted DB (readable while locked). Deleting the file only removes the UI delay — the real barrier is scrypt cost on the keyfile. Correct passphrase is also refused during an active delay.
- **Auto-lock:** OS lock-screen and suspend events (powerMonitor), plus system-idle polling (10 min default) measured by the OS so the renderer cannot fake activity. Manual lock button in the header. Lock on quit.
- **Audit:** `auth.setup`, `auth.unlock` (with method + failed-attempt count since last unlock), `auth.lock` (with reason). Failed attempts cannot be written to the locked DB; they are counted in the throttle file and attached to the next successful unlock's audit event.
- **Recovery:** recovery-key unlock forces a new passphrase and rotates the recovery key in the same step (old key invalidated, new one shown once).

**Alternatives:** OS-account trust only (fails the stolen-device case); separate password hash + unencrypted DB (lock becomes theater — the data must be encrypted anyway); biometric/`safeStorage` quick unlock (planned follow-up on top of this, not a replacement).

**Consequences:** renderer state for patients is dropped from the query cache on lock; unlock latency ≈ one scrypt derivation (~0.5–1 s, intentional). **Revisit:** configurable idle timeout + quick-unlock UX when the settings module lands.
