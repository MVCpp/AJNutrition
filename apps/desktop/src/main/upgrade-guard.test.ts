import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS,
  currentSchemaVersion,
  latestSchemaVersion,
  openDatabase,
  runMigrations,
  type Migration,
} from '@ajnutrition/database';
import {
  listUpgradeSnapshots,
  pruneUpgradeSnapshots,
  restoreUpgradeSnapshot,
  snapshotBeforeUpgrade,
  snapshotDir,
} from './upgrade-guard';

const DB_KEY = 'a'.repeat(64);

function makeDataDir(): { dataDir: string; dbPath: string } {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'ajn-upg-'));
  return { dataDir, dbPath: path.join(dataDir, 'ajnutrition.db3') };
}

/** An old database: everything except the last two migrations. */
function openAtOlderSchema(dbPath: string, behind = 2) {
  const db = openDatabase(dbPath, DB_KEY);
  const upTo = latestSchemaVersion() - behind;
  runMigrations(
    db,
    MIGRATIONS.filter((m) => m.id <= upTo),
  );
  return db;
}

const now = () => new Date('2026-07-27T10:30:00');

describe('pre-upgrade snapshot (Epic 8)', () => {
  it('takes no snapshot for a brand-new database or one already up to date', () => {
    const { dataDir, dbPath } = makeDataDir();
    const fresh = openDatabase(dbPath, DB_KEY);
    expect(snapshotBeforeUpgrade(fresh, { dataDir, now })).toBeNull();

    runMigrations(fresh);
    expect(snapshotBeforeUpgrade(fresh, { dataDir, now })).toBeNull();
    fresh.close();
    expect(existsSync(snapshotDir(dataDir))).toBe(false);
  });

  it('snapshots an existing database that has migrations pending', () => {
    const { dataDir, dbPath } = makeDataDir();
    const db = openAtOlderSchema(dbPath);

    const snapshot = snapshotBeforeUpgrade(db, { dataDir, now });
    db.close();

    expect(snapshot).not.toBeNull();
    expect(path.basename(snapshot ?? '')).toBe(
      `schema-${String(latestSchemaVersion() - 2).padStart(4, '0')}-20260727T103000.db3`,
    );
    // The copy is still encrypted with the database key: it must not open bare.
    expect(() =>
      openDatabase(snapshot ?? '', 'b'.repeat(64))
        .prepare('SELECT 1')
        .get(),
    ).toThrow();
    const copy = openDatabase(snapshot ?? '', DB_KEY);
    expect(currentSchemaVersion(copy)).toBe(latestSchemaVersion() - 2);
    copy.close();
  });

  it('rolls a failed migration run back to the snapshot, keeping the broken file aside', () => {
    const { dataDir, dbPath } = makeDataDir();
    const db = openAtOlderSchema(dbPath);
    const before = currentSchemaVersion(db);
    db.prepare(
      `INSERT INTO patients (id, file_number, first_name, last_name, date_of_birth,
                             sex_at_birth, created_at, updated_at)
       VALUES ('p1', 1, 'Carmen', 'Iñárritu', '1980-11-30', 'female', '2026-07-01', '2026-07-01')`,
    ).run();

    const snapshot = snapshotBeforeUpgrade(db, { dataDir, now });
    expect(snapshot).not.toBeNull();

    // First migration commits, the second blows up: exactly the half-applied
    // state a run of several migrations can leave behind.
    const broken: Migration[] = [
      { id: 9001, name: 'ok', up: 'CREATE TABLE nueva (id INTEGER PRIMARY KEY);' },
      // Fails loudly: the table already exists.
      { id: 9002, name: 'boom', up: 'CREATE TABLE patients (x INTEGER);' },
    ];
    expect(() => runMigrations(db, [...MIGRATIONS, ...broken])).toThrow();
    expect(currentSchemaVersion(db)).toBeGreaterThan(before); // half-upgraded
    db.close();

    restoreUpgradeSnapshot(snapshot ?? '', dbPath);

    const restored = openDatabase(dbPath, DB_KEY);
    expect(currentSchemaVersion(restored)).toBe(before);
    expect(
      restored.prepare(`SELECT name FROM sqlite_master WHERE name = 'nueva'`).get(),
    ).toBeUndefined();
    // The patient captured before the upgrade attempt is still there.
    expect(restored.prepare('SELECT COUNT(*) AS n FROM patients').get()).toEqual({ n: 1 });
    restored.close();

    expect(existsSync(`${dbPath}.failed-upgrade`)).toBe(true);
  });

  it('refuses to restore from a missing or empty snapshot', () => {
    const { dataDir, dbPath } = makeDataDir();
    expect(() => restoreUpgradeSnapshot(path.join(dataDir, 'no-existe.db3'), dbPath)).toThrow(
      /snapshot missing or empty/,
    );
  });

  it('keeps only the newest snapshots and ignores foreign files', () => {
    const { dataDir } = makeDataDir();
    const dir = snapshotDir(dataDir);
    mkdirSync(dir, { recursive: true });
    for (const name of [
      'schema-0021-20260701T090000.db3',
      'schema-0022-20260710T090000.db3',
      'schema-0023-20260720T090000.db3',
      'schema-0024-20260726T090000.db3',
    ]) {
      writeFileSync(path.join(dir, name), 'x');
    }
    writeFileSync(path.join(dir, 'notas.txt'), 'x');

    expect(pruneUpgradeSnapshots(dataDir, 2)).toBe(2);
    expect(listUpgradeSnapshots(dataDir)).toEqual([
      'schema-0024-20260726T090000.db3',
      'schema-0023-20260720T090000.db3',
    ]);
    expect(readdirSync(dir)).toContain('notas.txt');
  });
});
