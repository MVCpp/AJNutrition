import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppError } from '@ajnutrition/shared';
import { checkIntegrity, openDatabase } from './connection';
import { runMigrations } from './migrations';

/**
 * At-rest encryption acceptance tests (ADR-0006 / threats T-03, T-04):
 * a copied database file must be useless without the key.
 */

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

function tempDbPath(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), 'ajn-encdb-')), 'ajnutrition.db3');
}

describe('encrypted database', () => {
  it('persists no plaintext and no cleartext SQLite header on disk', () => {
    const file = tempDbPath();
    const db = openDatabase(file, KEY_A);
    runMigrations(db);
    db.prepare(
      `INSERT INTO patients (id, file_number, first_name, last_name, date_of_birth, sex_at_birth, status, created_at, updated_at)
       VALUES ('00000000-0000-4000-8000-000000000001', 1, 'MARCADOR_NOMBRE', 'MARCADOR_APELLIDO', '1990-01-01', 'unspecified', 'active', '2026-07-22T00:00:00Z', '2026-07-22T00:00:00Z')`,
    ).run();
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();

    const raw = readFileSync(file);
    expect(raw.includes(Buffer.from('MARCADOR_NOMBRE'))).toBe(false);
    expect(raw.includes(Buffer.from('MARCADOR_APELLIDO'))).toBe(false);
    expect(raw.subarray(0, 15).toString()).not.toBe('SQLite format 3');
  });

  it('reopens with the correct key and passes integrity check', () => {
    const file = tempDbPath();
    let db = openDatabase(file, KEY_A);
    runMigrations(db);
    db.close();

    db = openDatabase(file, KEY_A);
    expect(checkIntegrity(db).ok).toBe(true);
    const row = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number };
    expect(row.n).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it('refuses to open with a wrong key (ENCRYPTION error, no data replaced)', () => {
    const file = tempDbPath();
    const db = openDatabase(file, KEY_A);
    runMigrations(db);
    db.close();

    try {
      openDatabase(file, KEY_B);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('ENCRYPTION');
    }
    // Original database is untouched and still opens with the right key.
    const reopened = openDatabase(file, KEY_A);
    expect(checkIntegrity(reopened).ok).toBe(true);
    reopened.close();
  });

  it('rejects malformed keys before touching the file', () => {
    expect(() => openDatabase(tempDbPath(), 'short')).toThrowError(AppError);
    expect(() => openDatabase(tempDbPath(), 'Z'.repeat(64))).toThrowError(AppError);
  });
});
