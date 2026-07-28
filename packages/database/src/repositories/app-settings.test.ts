import { beforeEach, describe, expect, it } from 'vitest';
import type { DomainContext } from '@ajnutrition/domain';
import {
  GetAppSettingsUseCase,
  RecordAutoBackupRunUseCase,
  SaveAppSettingsUseCase,
  SetAutoBackupFolderUseCase,
  type AppSettingsDeps,
} from '@ajnutrition/application';
import { AUTO_BACKUP_DEFAULT_KEEP, AUTO_LOCK_DEFAULT_MINUTES } from '@ajnutrition/shared';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqliteAppSettingsRepository } from './sqlite-app-settings-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';

let db: SqliteDatabase;
let deps: AppSettingsDeps;
let idCounter = 0;

const ctx: DomainContext = {
  now: () => new Date('2026-07-26T12:00:00.000Z'),
  newId: () => {
    idCounter += 1;
    return `00000000-0000-4000-c000-${String(idCounter).padStart(12, '0')}`;
  },
};

beforeEach(() => {
  idCounter = 0;
  db = openInMemoryDatabase();
  runMigrations(db);
  deps = {
    uow: new SqliteUnitOfWork(db),
    settings: new SqliteAppSettingsRepository(db),
    audit: new SqliteAuditLog(db, {
      appVersion: '0.1.0-test',
      now: ctx.now,
      newId: ctx.newId,
    }),
    ctx,
  };
});

describe('app settings', () => {
  it('reports the conservative default before anything is saved', () => {
    expect(new GetAppSettingsUseCase({ settings: deps.settings }).execute()).toEqual({
      autoLockMinutes: AUTO_LOCK_DEFAULT_MINUTES,
      autoBackupEnabled: false,
      autoBackupFolder: null,
      autoBackupKeep: AUTO_BACKUP_DEFAULT_KEEP,
      lastAutoBackupAt: null,
      remindersEnabled: true,
      reminderMinutes: 15,
      updatedAt: null,
    });
  });

  it('merges a partial save over the stored row instead of clobbering it', () => {
    new SetAutoBackupFolderUseCase(deps).execute('D:\\Respaldos');
    new SaveAppSettingsUseCase(deps).execute({ autoBackupEnabled: true, autoBackupKeep: 3 });
    // Only the auto-lock value is sent: the backup preferences must survive.
    const settings = new SaveAppSettingsUseCase(deps).execute({ autoLockMinutes: 2 });

    expect(settings).toMatchObject({
      autoLockMinutes: 2,
      autoBackupEnabled: true,
      autoBackupFolder: 'D:\\Respaldos',
      autoBackupKeep: 3,
    });
  });

  it('stamps an automatic run without touching the practitioner preferences', () => {
    new SaveAppSettingsUseCase(deps).execute({ autoLockMinutes: 5 });
    const before = new GetAppSettingsUseCase({ settings: deps.settings }).execute();

    new RecordAutoBackupRunUseCase({ settings: deps.settings }).execute('2026-07-27T03:00:00.000Z');

    const after = new GetAppSettingsUseCase({ settings: deps.settings }).execute();
    expect(after.lastAutoBackupAt).toBe('2026-07-27T03:00:00.000Z');
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(after.autoLockMinutes).toBe(5);
  });

  it('keeps the backup folder out of the audit trail (it embeds the OS user name)', () => {
    new SetAutoBackupFolderUseCase(deps).execute('C:\\Users\\ana\\Respaldos');
    const rows = db
      .prepare(`SELECT metadata_json FROM audit_events WHERE action = 'settings.save'`)
      .all() as Array<{ metadata_json: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata_json).not.toContain('ana');
    expect(JSON.parse(rows[0]?.metadata_json ?? '{}')).toEqual({ autoBackupFolderSet: true });
  });

  it('refuses an out-of-range retention count at the database level', () => {
    const record = {
      autoLockMinutes: 10,
      autoBackupEnabled: true,
      autoBackupFolder: null,
      lastAutoBackupAt: null,
      remindersEnabled: true,
      reminderMinutes: 15,
      updatedAt: '2026-07-27',
    };
    expect(() => deps.settings.save({ ...record, autoBackupKeep: 0 })).toThrowError(
      /CHECK constraint/,
    );
    expect(() => deps.settings.save({ ...record, autoBackupKeep: 61 })).toThrowError(
      /CHECK constraint/,
    );
  });

  it('saves and reads back the auto-lock timeout, upserting the single row', () => {
    new SaveAppSettingsUseCase(deps).execute({ autoLockMinutes: 5 });
    expect(new GetAppSettingsUseCase({ settings: deps.settings }).execute().autoLockMinutes).toBe(
      5,
    );

    new SaveAppSettingsUseCase(deps).execute({ autoLockMinutes: 30 });
    expect(new GetAppSettingsUseCase({ settings: deps.settings }).execute().autoLockMinutes).toBe(
      30,
    );
    const count = db.prepare('SELECT COUNT(*) AS n FROM app_settings').get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('audits the change: auto-lock is a security control', () => {
    new SaveAppSettingsUseCase(deps).execute({ autoLockMinutes: 15 });
    const row = db
      .prepare(`SELECT metadata_json, result FROM audit_events WHERE action = 'settings.save'`)
      .get() as { metadata_json: string; result: string };
    expect(row.result).toBe('success');
    expect(JSON.parse(row.metadata_json)).toEqual({
      autoLockMinutes: 15,
      autoBackupEnabled: false,
      autoBackupKeep: AUTO_BACKUP_DEFAULT_KEEP,
      remindersEnabled: true,
    });
  });

  it('refuses an out-of-range timeout at the database level too', () => {
    const record = {
      autoBackupEnabled: false,
      autoBackupFolder: null,
      autoBackupKeep: 7,
      lastAutoBackupAt: null,
      remindersEnabled: true,
      reminderMinutes: 15,
      updatedAt: '2026-07-26',
    };
    expect(() => deps.settings.save({ ...record, autoLockMinutes: 0 })).toThrowError(
      /CHECK constraint/,
    );
    expect(() => deps.settings.save({ ...record, autoLockMinutes: 999 })).toThrowError(
      /CHECK constraint/,
    );
  });
});
