# ADR-0009: Packaging targets and installer technology

**Status:** Accepted for Windows + macOS (2026-07-21); macOS elevated from "future" to committed target by user decision the same day.

**Decision:**
- **Windows:** Squirrel installer (`AJNutrition-Setup.exe`) + ZIP. Per-user install, no admin rights, delta-update capable. Revisit vs WiX/MSI only if enterprise/machine-wide deployment appears.
- **macOS:** DMG + ZIP via Forge makers, `appBundleId com.ajnutrition.desktop`. Signing (`osxSign`) and notarization (`osxNotarize`) are activated purely by environment variables (`AJN_OSX_SIGN`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`) so credentials never enter the repo. Apple Silicon is the primary architecture; Intel/universal only if a real Intel Mac user appears.
- Builds are **per-OS on that OS** (native modules + signing make cross-building unsupported). Unsigned builds are development builds and must be labeled as such.
- Fuses applied at package time: RunAsNode off, NODE_OPTIONS off, CLI inspect off, cookie encryption on, ASAR integrity validation on, onlyLoadAppFromAsar on.

**Open items:** Windows code-signing certificate (A-12); Apple Developer account (S-114); packaged-app validation of externalized better-sqlite3 with plugin-vite on both OSes (known rough edge — S-113/S-114); auto-update strategy deferred to Phase 8 with pre-update backup mandate.
