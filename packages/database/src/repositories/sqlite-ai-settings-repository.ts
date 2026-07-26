import type { AiSettingsRecord, AiSettingsRepository } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';

/** Single-row table — plain SQL is clearer than Drizzle for an upsert-by-1. */
export class SqliteAiSettingsRepository implements AiSettingsRepository {
  constructor(private readonly db: SqliteDatabase) {}

  get(): AiSettingsRecord | null {
    const row = this.db
      .prepare(
        `SELECT enabled, provider, model, api_key_envelope, updated_at
         FROM ai_settings WHERE id = 1`,
      )
      .get() as
      | {
          enabled: number;
          provider: 'anthropic';
          model: string;
          api_key_envelope: string | null;
          updated_at: string;
        }
      | undefined;
    if (!row) return null;
    return {
      enabled: row.enabled === 1,
      provider: row.provider,
      model: row.model,
      apiKeyEnvelope: row.api_key_envelope,
      updatedAt: row.updated_at,
    };
  }

  save(record: AiSettingsRecord): void {
    this.db
      .prepare(
        `INSERT INTO ai_settings (id, enabled, provider, model, api_key_envelope, updated_at)
         VALUES (1, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           enabled = excluded.enabled,
           provider = excluded.provider,
           model = excluded.model,
           api_key_envelope = excluded.api_key_envelope,
           updated_at = excluded.updated_at`,
      )
      .run(
        record.enabled ? 1 : 0,
        record.provider,
        record.model,
        record.apiKeyEnvelope,
        record.updatedAt,
      );
  }
}
