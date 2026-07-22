# ADR-0005: IPC contract design (Zod both sides, strict envelopes, no generic invoke)

**Status:** Accepted (2026-07-21)

**Decision:**
- One channel registry (`shared/ipc/channels.ts`); string literals banned.
- Preload exposes `window.ajnutrition.<context>.<capability>()` typed by `AjnApi` — never `ipcRenderer`, never Node.
- Main re-validates every payload with the same Zod schemas the renderer forms use (`.strict()`: unknown keys rejected). The renderer is untrusted by definition.
- Handlers verify `senderFrame` origin (dev server or `file://` app bundle), return `IpcResult<T>` envelopes, and never reject with raw exceptions (stack/path leak). Failures and denied senders emit audit events with sanitized metadata.
- Error taxonomy: 19 stable codes in `shared/errors.ts`; user messages are safe + localized; internals travel only via `internalDetail` to (future) redacted logs, correlated by `supportCode`.

**Alternatives:** tRPC-over-IPC (nice DX, but hides the security boundary and adds a dependency at the most security-critical seam); generic `invoke(channel, payload)` bridge (explicitly forbidden by the brief and by common sense).

**Revisit if:** handler count makes codegen from schemas worthwhile.
