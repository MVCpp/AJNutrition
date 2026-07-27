# Upgrade & rollback strategy

How a NutriPlan installation moves from one version to the next without losing
data, and what happens when that goes wrong.

## What runs at unlock

`createContainer` (main process) is the composition root and executes on every
unlock, in this order:

1. Open the encrypted database with the derived DB key.
2. `PRAGMA integrity_check` — a damaged file stops here (`INTEGRITY`).
3. `assertSchemaNotAhead` — refuse a file written by a **newer** app version.
   Migrations are forward-only; running an old build against a new schema
   would silently misread data, so it is rejected instead.
4. **Pre-upgrade snapshot** (below) when migrations are pending.
5. `runMigrations` — apply every pending migration, each in its own
   transaction.
6. Seed the bundled USDA/CONABIO catalogs (idempotent).

## Pre-upgrade snapshot

Each migration is transactional on its own, but a _run_ of several is not: if
migration 26 fails after 25 committed, the file is left half-upgraded. Combined
with the downgrade refusal in step 3, a single bad migration in a future release
would otherwise strand the practitioner — the new build cannot finish and the
old build will not open the file.

So, before applying anything to an **existing** database (`apps/desktop/src/main/upgrade-guard.ts`):

- `VACUUM INTO data/pre-upgrade/schema-<from>-<timestamp>.db3` — a consistent
  copy that is **still encrypted with the same database key**. No plaintext
  reaches the disk, and the copy is worthless without the passphrase.
- If `runMigrations` throws: close the handle, move the half-upgraded file
  aside as `ajnutrition.db3.failed-upgrade` (for support), copy the snapshot
  back, delete the `-wal`/`-shm` sidecars, and surface a `MIGRATION` error
  telling the practitioner their data is intact and to reinstall the previous
  version or restore a backup.
- On success, keep the **3** most recent snapshots and delete older ones. Only
  files matching `schema-<digits>-<timestamp>.db3` are ever deletion
  candidates.

A brand-new database is never snapshotted — there is nothing to roll back to.

This is **not** a backup: it lives next to the database and does not survive
losing the machine. Backups (manual and scheduled, `.ajnbackup`) are the
off-machine protection; the snapshot only makes a failed upgrade reversible.

## Release checklist for a schema-changing version

1. New migration appended with the next id — never edit a released migration.
2. Test that upgrades from the **previous released schema** with data present,
   not just from empty.
3. `pnpm test` on all three OSes via CI, then a packaged smoke test.
4. Note in the release the last version that can still open the file, since
   downgrade is refused.
