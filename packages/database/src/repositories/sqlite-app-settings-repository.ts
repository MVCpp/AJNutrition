import type { AppSettingsRecord, AppSettingsRepository } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';

/** Single-row table — plain SQL is clearer than Drizzle for an upsert-by-1. */
export class SqliteAppSettingsRepository implements AppSettingsRepository {
  constructor(private readonly db: SqliteDatabase) {}

  get(): AppSettingsRecord | null {
    const row = this.db
      .prepare('SELECT auto_lock_minutes, updated_at FROM app_settings WHERE id = 1')
      .get() as { auto_lock_minutes: number; updated_at: string } | undefined;
    if (!row) return null;
    return { autoLockMinutes: row.auto_lock_minutes, updatedAt: row.updated_at };
  }

  save(record: AppSettingsRecord): void {
    this.db
      .prepare(
        `INSERT INTO app_settings (id, auto_lock_minutes, updated_at)
         VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           auto_lock_minutes = excluded.auto_lock_minutes,
           updated_at = excluded.updated_at`,
      )
      .run(record.autoLockMinutes, record.updatedAt);
  }
}
