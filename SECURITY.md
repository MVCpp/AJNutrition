# Security Policy

AJNutrition is designed to hold sensitive health and identity information on a local device. Security posture, controls, and accepted risks are documented in `docs/security/threat-model.md` and the ADRs.

## Current state (honest summary)

Implemented: sandboxed renderer with context isolation, strict CSP, default-deny permissions, navigation/window lockdown, Electron hardening fuses, Zod-validated IPC with typed sanitized errors, transactional SQLite with integrity checks and forward-only migrations, audit logging with sanitized metadata, supply-chain controls (locked dependencies, default-blocked build scripts), **full-database encryption at rest** (ChaCha20-Poly1305 via SQLite3 Multiple Ciphers; scrypt→KEK→master-key hierarchy with a one-time recovery key — ADR-0006), and **local authentication with application locking** (unlock throttling, auto-lock on OS lock/suspend/inactivity, key zeroing on lock — ADR-0010).

Also implemented: **encrypted backups** (`.ajnbackup` — self-contained, independently encrypted, tamper-evident, transactional restore with rollback; ADR-0011).

**Not yet implemented — real patient data is not approved for entry:** redacted structured logging, CI, and packaged-app validation on real Windows/macOS. These are P0 items in `docs/product/backlog.md`.

## No compliance claims

Implementing controls is not compliance. No claim is made regarding LFPDPPP (Mexico), clinical-record norms, HIPAA, GDPR, or any certification. A compliance-readiness matrix and qualified legal review are prerequisites for any such claim.

## Reporting

Report suspected vulnerabilities privately to the repository owner. Do not open public issues containing exploit details or any real personal data.

## Data handling rules for contributors

- Never commit real patient data, screenshots of real data, credentials, keys, or certificates.
- Test data must be synthetic and clearly fictional.
- New IPC handlers require: schema validation, threat-model row, audit behavior, and tests before merge.
