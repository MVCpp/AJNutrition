import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';

/**
 * Scheduled backups (S-109 completion). Main-process only.
 *
 * Runs at most once per calendar day while the app is unlocked, writing the
 * same encrypted .ajnbackup container a manual backup produces into a folder
 * the practitioner chose in a native dialog, then trimming the folder to the
 * configured number of copies.
 *
 * Design constraints:
 * - It must NEVER throw. A failed automatic backup is reported and logged; it
 *   may not take the app down or block unlocking.
 * - Retention only ever deletes files matching the automatic naming pattern.
 *   Manual backups (NutriPlan_Backup_…) and anything else the practitioner
 *   keeps in that folder are untouchable.
 */

const AUTO_BACKUP_PREFIX = 'NutriPlan_AutoBackup_';
/** Deliberately strict: a file we did not write must never be a deletion candidate. */
const AUTO_BACKUP_FILE = /^NutriPlan_AutoBackup_\d{4}-\d{2}-\d{2}_\d{4}\.ajnbackup$/;

export function autoBackupFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${AUTO_BACKUP_PREFIX}${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.ajnbackup`;
}

/** Local calendar day; "daily" means the practitioner's day, not UTC's. */
function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isAutoBackupDue(lastRunIso: string | null, now: Date): boolean {
  if (lastRunIso === null) return true;
  const last = new Date(lastRunIso);
  if (Number.isNaN(last.getTime())) return true;
  return localDay(last) !== localDay(now);
}

/** Removes the oldest automatic backups beyond `keep`. Returns how many went. */
export function pruneAutoBackups(folder: string, keep: number): number {
  const names = readdirSync(folder)
    .filter((name) => AUTO_BACKUP_FILE.test(name))
    // The timestamp is embedded in the name, so lexicographic = chronological.
    .sort()
    .reverse();
  let removed = 0;
  for (const name of names.slice(Math.max(keep, 1))) {
    try {
      unlinkSync(path.join(folder, name));
      removed += 1;
    } catch {
      // A locked or already-deleted file must not abort the sweep.
    }
  }
  return removed;
}

export interface AutoBackupPreferences {
  autoBackupEnabled: boolean;
  autoBackupFolder: string | null;
  autoBackupKeep: number;
  lastAutoBackupAt: string | null;
}

export type AutoBackupOutcome =
  | { status: 'disabled' }
  | { status: 'no-folder' }
  | { status: 'not-due' }
  | { status: 'folder-missing' }
  | { status: 'created'; fileName: string; sizeBytes: number; removed: number }
  | { status: 'failed'; reason: string };

export interface AutoBackupDeps {
  now: () => Date;
  /** Throws when locked — the preferences live inside the encrypted database. */
  readPreferences: () => AutoBackupPreferences;
  createBackup: (
    destinationPath: string,
    description: string | null,
  ) => { fileName: string; sizeBytes: number };
  markRun: (isoTimestamp: string) => void;
  logger?: { info(area: string, event: string, data?: unknown): void };
}

export class AutoBackupRunner {
  constructor(private readonly deps: AutoBackupDeps) {}

  run(): AutoBackupOutcome {
    const outcome = this.attempt();
    this.deps.logger?.info('backup', 'auto', { status: outcome.status });
    return outcome;
  }

  private attempt(): AutoBackupOutcome {
    const { now, readPreferences, createBackup, markRun } = this.deps;
    let prefs: AutoBackupPreferences;
    try {
      prefs = readPreferences();
    } catch (err) {
      return { status: 'failed', reason: `settings unreadable: ${String(err)}` };
    }

    if (!prefs.autoBackupEnabled) return { status: 'disabled' };
    const folder = prefs.autoBackupFolder;
    if (folder === null || folder.trim() === '') return { status: 'no-folder' };
    // An unplugged external drive is an expected state, not an error to retry
    // in a loop: report it so the UI can show the folder is unreachable.
    if (!existsSync(folder)) return { status: 'folder-missing' };

    const at = now();
    if (!isAutoBackupDue(prefs.lastAutoBackupAt, at)) return { status: 'not-due' };

    try {
      const result = createBackup(path.join(folder, autoBackupFileName(at)), 'Respaldo automático');
      // Stamp before pruning: the backup exists either way, and a prune
      // failure must not cause an endless retry loop.
      markRun(at.toISOString());
      const removed = pruneAutoBackups(folder, prefs.autoBackupKeep);
      return {
        status: 'created',
        fileName: result.fileName,
        sizeBytes: result.sizeBytes,
        removed,
      };
    } catch (err) {
      return { status: 'failed', reason: String(err) };
    }
  }
}
