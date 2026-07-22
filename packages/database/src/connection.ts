import Database from 'better-sqlite3';

export type SqliteDatabase = Database.Database;

/**
 * Opens (or creates) the application database with the mandatory pragmas.
 * Only the Electron main process may call this — never the renderer.
 *
 * NOTE (ADR-0006): at-rest encryption is not yet wired in. Until it is,
 * production use with real patient data is NOT approved.
 */
export function openDatabase(filePath: string): SqliteDatabase {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('trusted_schema = OFF');
  return db;
}

export function checkIntegrity(db: SqliteDatabase): { ok: boolean; detail: string } {
  const rows = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
  const detail = rows.map((r) => r.integrity_check).join('; ');
  return { ok: detail === 'ok', detail };
}
