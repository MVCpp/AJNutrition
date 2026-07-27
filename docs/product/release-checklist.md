# Release checklist

Run top to bottom for every version handed to the practitioner. Nothing here
is optional: a desktop app that holds clinical records has no server-side undo.

## 1. Code is green

- [ ] `pnpm typecheck` — all nine packages
- [ ] `pnpm lint` and `pnpm format:check`
- [ ] `pnpm test` — full unit/integration suite
- [ ] CI green on all three OSes for the exact commit being released
- [ ] `pnpm package` then `pnpm e2e` — Playwright against the built bundle

## 2. Data safety

- [ ] Any new migration has the next free id and no released migration was edited
- [ ] Upgrade tested from the **previous released schema with data present**,
      not just from an empty database (see `docs/product/upgrades.md`)
- [ ] A restore of a backup taken with the **previous** version succeeds
- [ ] Release notes state the oldest app version that can still open this
      schema — downgrade is refused by design

## 3. Supply chain

- [ ] `pnpm audit` clean, or every finding triaged in writing
- [ ] `node scripts/generate-sbom.mjs` re-run **on the build machine** and
      `docs/security/sbom.json` committed (optional deps resolve per platform)
- [ ] SBOM diff reviewed: no unexpected new dependency, no copyleft license
      appearing in a product that is distributed as a binary

## 4. Artifacts

- [ ] Windows installer built and installed on a clean machine:
      install → launch → setup → create a patient → reopen → uninstall
- [ ] Squirrel `authors` field is the practice's **legal name** — it becomes
      the Windows "Publisher" (still a placeholder as of 2026-07-27)
- [ ] Windows artifact signed (S-114, blocked on the certificate)
- [ ] macOS DMG signed and notarized, Gatekeeper verified (blocked on hardware
      and an Apple Developer account)

## 5. Security review

- [ ] Every new IPC handler has a threat-model row, a Zod `.strict()` schema
      and audit behavior
- [ ] No new field reaches the AI payload without re-reviewing T-20
- [ ] `docs/security/threat-model.md` standing rules still hold for the diff

## 6. Hand-off

- [ ] The practitioner has their passphrase and recovery key stored somewhere
      that is not the same machine
- [ ] Automatic backups configured to an external or synced folder
      (⚙️ Ajustes), and one restore rehearsed at least once
