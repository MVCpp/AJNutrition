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
    connection: SqliteDatabase,
    private readonly options: AuditLogOptions,
  ) {
    this.db = drizzle(connection);
  }

  record(event: AuditEventInput): void {
    this.db.insert(auditEvents).values({
      id: this.options.newId(),
      occurredAt: this.options.now().toISOString(),
      actor: 'practitioner',
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      result: event.result,
      appVersion: this.options.appVersion,
      metadataJson: event.metadata ? JSON.stringify(event.metadata) : null,
    }).run();
  }
}
