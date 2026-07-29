import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { AuditEventInput, AuditLog } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';
import { auditEvents } from '../schema';

export interface AuditLogOptions {
  appVersion: string;
  now: () => Date;
  newId: () => string;
}

export class SqliteAuditLog implements AuditLog {
  private readonly db: BetterSQLite3Database;

  constructor(
    private readonly connection: SqliteDatabase,
    private readonly options: AuditLogOptions,
  ) {
    this.db = drizzle(connection);
  }

  record(event: AuditEventInput): void {
    this.db
      .insert(auditEvents)
      .values({
        id: this.options.newId(),
        occurredAt: this.options.now().toISOString(),
        actor: 'practitioner',
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        result: event.result,
        appVersion: this.options.appVersion,
        metadataJson: event.metadata ? JSON.stringify(event.metadata) : null,
      })
      .run();
  }

  lastEventAt(action: string, entityId: string): string | null {
    const row = this.connection
      .prepare(
        `SELECT occurred_at FROM audit_events
          WHERE action = ? AND entity_id = ?
          ORDER BY occurred_at DESC LIMIT 1`,
      )
      .get(action, entityId) as { occurred_at: string } | undefined;
    return row?.occurred_at ?? null;
  }
}
