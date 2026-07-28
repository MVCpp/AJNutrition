import type { AppSettingsRecord, AppSettingsRepository } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';

interface AppSettingsRow {
  auto_lock_minutes: number;
  auto_backup_enabled: number;
  auto_backup_folder: string | null;
  auto_backup_keep: number;
  last_auto_backup_at: string | null;
  reminders_enabled: number;
  reminder_minutes: number;
  updated_at: string;
}

/** Single-row table — plain SQL is clearer than Drizzle for an upsert-by-1. */
export class SqliteAppSettingsRepository implements AppSettingsRepository {
  constructor(private readonly db: SqliteDatabase) {}

  get(): AppSettingsRecord | null {
    const row = this.db
      .prepare(
        `SELECT auto_lock_minutes, auto_backup_enabled, auto_backup_folder,
                auto_backup_keep, last_auto_backup_at, reminders_enabled,
                reminder_minutes, updated_at
           FROM app_settings WHERE id = 1`,
      )
      .get() as AppSettingsRow | undefined;
    if (!row) return null;
    return {
      autoLockMinutes: row.auto_lock_minutes,
      autoBackupEnabled: row.auto_backup_enabled === 1,
      autoBackupFolder: row.auto_backup_folder,
      autoBackupKeep: row.auto_backup_keep,
      lastAutoBackupAt: row.last_auto_backup_at,
      remindersEnabled: row.reminders_enabled === 1,
      reminderMinutes: row.reminder_minutes,
      updatedAt: row.updated_at,
    };
  }

  save(record: AppSettingsRecord): void {
    this.db
      .prepare(
        `INSERT INTO app_settings (id, auto_lock_minutes, auto_backup_enabled,
                                   auto_backup_folder, auto_backup_keep,
                                   last_auto_backup_at, reminders_enabled,
                                   reminder_minutes, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           auto_lock_minutes = excluded.auto_lock_minutes,
           auto_backup_enabled = excluded.auto_backup_enabled,
           auto_backup_folder = excluded.auto_backup_folder,
           auto_backup_keep = excluded.auto_backup_keep,
           last_auto_backup_at = excluded.last_auto_backup_at,
           reminders_enabled = excluded.reminders_enabled,
           reminder_minutes = excluded.reminder_minutes,
           updated_at = excluded.updated_at`,
      )
      .run(
        record.autoLockMinutes,
        record.autoBackupEnabled ? 1 : 0,
        record.autoBackupFolder,
        record.autoBackupKeep,
        record.lastAutoBackupAt,
        record.remindersEnabled ? 1 : 0,
        record.reminderMinutes,
        record.updatedAt,
      );
  }

  markAutoBackupRun(at: string): void {
    this.db.prepare('UPDATE app_settings SET last_auto_backup_at = ? WHERE id = 1').run(at);
  }
}
