import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './schema';

/** Mirrors migration 0003 — migrations.ts remains the physical source of truth. */

export const clinicalHistoryEntries = sqliteTable(
  'clinical_history_entries',
  {
    id: text('id').primaryKey(),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    category: text('category', {
      enum: [
        'allergy',
        'intolerance',
        'pathological',
        'non_pathological',
        'family',
        'medication',
        'supplement',
        'surgery',
        'dietary_pattern',
        'physical_activity',
        'preference',
        'other',
      ],
    }).notNull(),
    content: text('content').notNull(),
    supersededAt: text('superseded_at'),
    supersededById: text('superseded_by_id'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_history_patient').on(table.patientId, table.category)],
);
