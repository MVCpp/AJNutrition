import Database from 'better-sqlite3-multiple-ciphers';
import { AppError } from '@ajnutrition/shared';

export type SqliteDatabase = Database.Database;

/**
 * Opens (or creates) an encrypted application database (ADR-0006, Option A:
 * SQLite3 Multiple Ciphers, ChaCha20-Poly1305 cipher).
 *
 * `dbKeyHex` is the HKDF-derived 256-bit database key (see
 * @ajnutrition/security deriveDbKeyHex). It is passed as a high-entropy key
 * string; the cipher's internal KDF stretches it once at open time.
 *
 * Only the Electron main process may call this — never the renderer.
 */
export function openDatabase(filePath: string, dbKeyHex: string): SqliteDatabase {
  if (!/^[0-9a-f]{64}$/.test(dbKeyHex)) {
    throw new AppError({
      code: 'ENCRYPTION',
      message: 'Clave de base de datos inválida.',
      internalDetail: 'dbKeyHex must be 64 lowercase hex chars',
    });
  }
  const db = new Database(filePath);
  try {
    db.pragma(`cipher='chacha20'`);
    db.pragma(`key='${dbKeyHex}'`);
    // First real read fails here if the key is wrong or the file is an
    // unencrypted/foreign database.
    db.pragma('journal_mode = WAL');
    db.prepare('SELECT count(*) FROM sqlite_master').get();
  } catch (err) {
    db.close();
    throw new AppError({
      code: 'ENCRYPTION',
      message:
        'No fue posible abrir la base de datos cifrada. La clave no coincide o el archivo no es una base de datos de AJNutrition.',
      internalDetail: `encrypted open failed: ${String(err)}`,
      cause: err,
    });
  }
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('trusted_schema = OFF');
  return db;
}

/** Test/tooling helper: plain unencrypted in-memory database. */
export function openInMemoryDatabase(): SqliteDatabase {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
}

export function checkIntegrity(db: SqliteDatabase): { ok: boolean; detail: string } {
  const rows = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
  const detail = rows.map((r) => r.integrity_check).join('; ');
  return { ok: detail === 'ok', detail };
}
