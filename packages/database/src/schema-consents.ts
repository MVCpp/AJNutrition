import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './schema';

/** Mirrors migration 0004 — migrations.ts remains the physical source of truth. */

export const consentRecords = sqliteTable(
  'consent_records',
  {
    id: text('id').primaryKey(),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    consentType: text('consent_type', {
      enum: ['data_processing', 'photo', 'ai_processing', 'communications', 'third_party_transfer'],
    }).notNull(),
    noticeVersion: text('notice_version').notNull(),
    status: text('status', { enum: ['accepted', 'declined', 'withdrawn'] }).notNull(),
    method: text('method', { enum: ['verbal', 'written', 'digital'] }).notNull(),
    decidedAt: text('decided_at').notNull(),
    withdrawnAt: text('withdrawn_at'),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_consents_patient').on(table.patientId, table.consentType)],
);
