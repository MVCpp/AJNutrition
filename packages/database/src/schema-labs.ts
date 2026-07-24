import { index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './schema';
import { consultations } from './schema-consultations';

/** Mirrors migration 0018 — migrations.ts remains the physical source of truth. */

export const labResults = sqliteTable(
  'lab_results',
  {
    id: text('id').primaryKey(),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    consultationId: text('consultation_id').references(() => consultations.id),
    collectedAt: text('collected_at').notNull(),
    analyte: text('analyte').notNull(),
    value: real('value').notNull(),
    unit: text('unit').notNull(),
    referenceLow: real('reference_low'),
    referenceHigh: real('reference_high'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_lab_results_patient').on(table.patientId, table.collectedAt)],
);
