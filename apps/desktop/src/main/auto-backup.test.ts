import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AutoBackupRunner,
  autoBackupFileName,
  isAutoBackupDue,
  pruneAutoBackups,
  type AutoBackupPreferences,
} from './auto-backup';

function folder(): string {
  return mkdtempSync(path.join(tmpdir(), 'ajn-auto-'));
}

function touch(dir: string, name: string): string {
  const file = path.join(dir, name);
  writeFileSync(file, 'x');
  return file;
}

interface Harness {
  runner: AutoBackupRunner;
  created: string[];
  marked: string[];
}

function makeRunner(
  prefs: Partial<AutoBackupPreferences> & { autoBackupFolder: string | null },
  now = new Date('2026-07-27T09:00:00.000Z'),
): Harness {
  const created: string[] = [];
  const marked: string[] = [];
  const runner = new AutoBackupRunner({
    now: () => now,
    readPreferences: () => ({
      autoBackupEnabled: true,
      autoBackupKeep: 7,
      lastAutoBackupAt: null,
      ...prefs,
    }),
    createBackup: (destinationPath) => {
      touch(path.dirname(destinationPath), path.basename(destinationPath));
      created.push(destinationPath);
      return { fileName: path.basename(destinationPath), sizeBytes: 1 };
    },
    markRun: (at) => marked.push(at),
  });
  return { runner, created, marked };
}

describe('scheduled backups (S-109)', () => {
  it('is due when it has never run and once per local calendar day after that', () => {
    const now = new Date('2026-07-27T09:00:00');
    expect(isAutoBackupDue(null, now)).toBe(true);
    expect(isAutoBackupDue(new Date('2026-07-27T01:00:00').toISOString(), now)).toBe(false);
    expect(isAutoBackupDue(new Date('2026-07-26T23:59:00').toISOString(), now)).toBe(true);
    // A corrupt stamp must fail towards backing up, never towards skipping.
    expect(isAutoBackupDue('no es una fecha', now)).toBe(true);
  });

  it('writes a backup into the chosen folder and stamps the run', () => {
    const dir = folder();
    const { runner, created, marked } = makeRunner({ autoBackupFolder: dir });

    const outcome = runner.run();

    expect(outcome.status).toBe('created');
    expect(created).toHaveLength(1);
    expect(path.dirname(created[0] ?? '')).toBe(dir);
    expect(path.basename(created[0] ?? '')).toMatch(
      /^NutriPlan_AutoBackup_\d{4}-\d{2}-\d{2}_\d{4}\.ajnbackup$/,
    );
    expect(marked).toEqual(['2026-07-27T09:00:00.000Z']);
  });

  it('does nothing when disabled, unconfigured, already run today, or the folder is gone', () => {
    const dir = folder();
    expect(
      makeRunner({ autoBackupFolder: dir, autoBackupEnabled: false }).runner.run().status,
    ).toBe('disabled');
    expect(makeRunner({ autoBackupFolder: null }).runner.run().status).toBe('no-folder');
    expect(
      makeRunner({ autoBackupFolder: path.join(dir, 'unidad-desconectada') }).runner.run().status,
    ).toBe('folder-missing');

    const today = new Date('2026-07-27T09:00:00');
    const { runner, created } = makeRunner(
      { autoBackupFolder: dir, lastAutoBackupAt: new Date('2026-07-27T07:00:00').toISOString() },
      today,
    );
    expect(runner.run().status).toBe('not-due');
    expect(created).toEqual([]);
  });

  it('reports a failure instead of throwing, and does not stamp the run', () => {
    const dir = folder();
    const marked: string[] = [];
    const runner = new AutoBackupRunner({
      now: () => new Date('2026-07-27T09:00:00.000Z'),
      readPreferences: () => ({
        autoBackupEnabled: true,
        autoBackupFolder: dir,
        autoBackupKeep: 7,
        lastAutoBackupAt: null,
      }),
      createBackup: () => {
        throw new Error('disco lleno');
      },
      markRun: (at) => marked.push(at),
    });

    const outcome = runner.run();
    expect(outcome.status).toBe('failed');
    expect(outcome).toMatchObject({ reason: expect.stringContaining('disco lleno') });
    expect(marked).toEqual([]);
  });

  it('reports a failure when the settings cannot be read (app locked)', () => {
    const runner = new AutoBackupRunner({
      now: () => new Date(),
      readPreferences: () => {
        throw new Error('locked');
      },
      createBackup: () => ({ fileName: 'x', sizeBytes: 0 }),
      markRun: () => undefined,
    });
    expect(runner.run().status).toBe('failed');
  });

  it('retains only the newest N automatic backups', () => {
    const dir = folder();
    for (const day of ['21', '22', '23', '24']) {
      touch(dir, `NutriPlan_AutoBackup_2026-07-${day}_0300.ajnbackup`);
    }

    expect(pruneAutoBackups(dir, 2)).toBe(2);
    expect(readdirSync(dir).sort()).toEqual([
      'NutriPlan_AutoBackup_2026-07-23_0300.ajnbackup',
      'NutriPlan_AutoBackup_2026-07-24_0300.ajnbackup',
    ]);
  });

  it('never deletes manual backups or unrelated files', () => {
    const dir = folder();
    touch(dir, 'NutriPlan_AutoBackup_2026-07-20_0300.ajnbackup');
    touch(dir, 'NutriPlan_AutoBackup_2026-07-21_0300.ajnbackup');
    const manual = touch(dir, 'NutriPlan_Backup_2026-07-01_1200.ajnbackup');
    const renamed = touch(dir, 'respaldo importante.ajnbackup');
    const foreign = touch(dir, 'tesis.docx');

    expect(pruneAutoBackups(dir, 1)).toBe(1);
    expect(existsSync(manual)).toBe(true);
    expect(existsSync(renamed)).toBe(true);
    expect(existsSync(foreign)).toBe(true);
  });

  it('prunes right after creating, keeping the fresh copy', () => {
    const dir = folder();
    touch(dir, 'NutriPlan_AutoBackup_2026-07-20_0300.ajnbackup');
    touch(dir, 'NutriPlan_AutoBackup_2026-07-21_0300.ajnbackup');

    const outcome = makeRunner({ autoBackupFolder: dir, autoBackupKeep: 2 }).runner.run();

    expect(outcome).toMatchObject({ status: 'created', removed: 1 });
    const remaining = readdirSync(dir).sort();
    expect(remaining).toHaveLength(2);
    expect(remaining.at(-1)).toBe(autoBackupFileName(new Date('2026-07-27T09:00:00.000Z')));
  });
});
