import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Drizzle table definitions. These MUST mirror the SQL in migrations.ts —
 * migrations are the source of truth for the physical schema; this file gives
 * queries type safety. The repository integration tests run the real
 * migrations and then exercise these definitions, which catches drift.
 */

export const patients = sqliteTable(
  'patients',
  {
    id: text('id').primaryKey(),
    fileNumber: integer('file_number').notNull().unique(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    dateOfBirth: text('date_of_birth').notNull(),
    sexAtBirth: text('sex_at_birth', { enum: ['female', 'male', 'unspecified'] }).notNull(),
    email: text('email'),
    phone: text('phone'),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    archivedAt: text('archived_at'),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    index('idx_patients_names').on(table.lastName, table.firstName),
    index('idx_patients_status').on(table.status),
  ],
);

export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    occurredAt: text('occurred_at').notNull(),
    actor: text('actor').notNull().default('practitioner'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    result: text('result', { enum: ['success', 'failure', 'denied'] }).notNull(),
    appVersion: text('app_version').notNull(),
    metadataJson: text('metadata_json'),
  },
  (table) => [
    index('idx_audit_entity').on(table.entityType, table.entityId),
    index('idx_audit_occurred').on(table.occurredAt),
  ],
);
