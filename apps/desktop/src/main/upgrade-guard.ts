import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  currentSchemaVersion,
  latestSchemaVersion,
  type SqliteDatabase,
} from '@ajnutrition/database';

/**
 * Pre-upgrade safety net (Epic 8: "update strategy with pre-update backup").
 *
 * Migrations are individually transactional, but a RUN of several is not: if
 * migration 26 fails after 25 committed, the file is left half-upgraded. The
 * practitioner cannot go back either — reinstalling the previous version hits
 * the deliberate downgrade refusal (`assertSchemaNotAhead`), so a single buggy
 * migration in a future release would strand them.
 *
 * So: before applying any pending migration to an EXISTING database, take a
 * snapshot of it; if the run fails, put the snapshot back. The snapshot is a
 * `VACUUM INTO` copy, which means it stays encrypted with the same database
 * key — no plaintext ever touches the disk.
 *
 * This is not a substitute for backups: it lives beside the database, so it
 * does not survive losing the machine. It exists purely to make a failed
 * upgrade recoverable by reinstalling the previous version.
 */

const SNAPSHOT_DIR = 'pre-upgrade';
/** Strict: only files this module wrote may ever be deleted or restored. */
const SNAPSHOT_FILE = /^schema-(\d+)-\d{8}T\d{6}\.db3$/;
const DEFAULT_KEEP = 3;

function stamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

export function snapshotDir(dataDir: string): string {
  return path.join(dataDir, SNAPSHOT_DIR);
}

/** Newest first. */
export function listUpgradeSnapshots(dataDir: string): string[] {
  const dir = snapshotDir(dataDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => SNAPSHOT_FILE.test(name))
    .sort()
    .reverse();
}

export function pruneUpgradeSnapshots(dataDir: string, keep = DEFAULT_KEEP): number {
  const dir = snapshotDir(dataDir);
  let removed = 0;
  for (const name of listUpgradeSnapshots(dataDir).slice(Math.max(keep, 1))) {
    try {
      rmSync(path.join(dir, name), { force: true });
      removed += 1;
    } catch {
      // A locked leftover copy must not stop the app from starting.
    }
  }
  return removed;
}

/**
 * Copies the database aside when migrations are pending. Returns the snapshot
 * path, or null when there is nothing to protect (fresh database, or already
 * up to date).
 */
export function snapshotBeforeUpgrade(
  db: SqliteDatabase,
  options: { dataDir: string; now: () => Date },
): string | null {
  const from = currentSchemaVersion(db);
  // A brand-new database holds nothing worth rolling back to.
  if (from === 0 || from >= latestSchemaVersion()) return null;

  const dir = snapshotDir(options.dataDir);
  mkdirSync(dir, { recursive: true });
  const target = path.join(
    dir,
    `schema-${String(from).padStart(4, '0')}-${stamp(options.now())}.db3`,
  );
  rmSync(target, { force: true });
  db.prepare('VACUUM INTO ?').run(target);
  return target;
}

/**
 * Puts a snapshot back in place of the live database. The caller MUST have
 * closed its database handle first. The half-upgraded file is kept as
 * `.failed-upgrade` so a support session can still inspect what went wrong.
 */
export function restoreUpgradeSnapshot(snapshotPath: string, dbPath: string): void {
  if (!existsSync(snapshotPath) || statSync(snapshotPath).size === 0) {
    throw new Error(`pre-upgrade snapshot missing or empty: ${snapshotPath}`);
  }
  rmSync(`${dbPath}.failed-upgrade`, { force: true });
  copyFileSync(dbPath, `${dbPath}.failed-upgrade`);
  copyFileSync(snapshotPath, dbPath);
  // SQLite sidecars belong to the file we just replaced; leaving them would
  // reapply journal pages from the failed run on the next open.
  for (const sidecar of ['-wal', '-shm']) {
    rmSync(`${dbPath}${sidecar}`, { force: true });
  }
}
