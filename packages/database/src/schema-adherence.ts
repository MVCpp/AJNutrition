import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './schema';
import { consultations } from './schema-consultations';

/** Mirrors migration 0019 — migrations.ts remains the physical source of truth. */

export const adherenceEntries = sqliteTable(
  'adherence_entries',
  {
    id: text('id').primaryKey(),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    consultationId: text('consultation_id').references(() => consultations.id),
    recordedAt: text('recorded_at').notNull(),
    score: integer('score').notNull(),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_adherence_patient').on(table.patientId, table.recordedAt)],
);
