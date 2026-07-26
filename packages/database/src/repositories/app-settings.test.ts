import { beforeEach, describe, expect, it } from 'vitest';
import type { DomainContext } from '@ajnutrition/domain';
import {
  GetAppSettingsUseCase,
  SaveAppSettingsUseCase,
  type AppSettingsDeps,
} from '@ajnutrition/application';
import { AUTO_LOCK_DEFAULT_MINUTES } from '@ajnutrition/shared';
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
      updatedAt: null,
    });
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
    expect(JSON.parse(row.metadata_json)).toEqual({ autoLockMinutes: 15 });
  });

  it('refuses an out-of-range timeout at the database level too', () => {
    expect(() => deps.settings.save({ autoLockMinutes: 0, updatedAt: '2026-07-26' })).toThrowError(
      /CHECK constraint/,
    );
    expect(() =>
      deps.settings.save({ autoLockMinutes: 999, updatedAt: '2026-07-26' }),
    ).toThrowError(/CHECK constraint/);
  });
});
