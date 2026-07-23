import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './schema';

/** Mirrors migration 0006 — migrations.ts remains the physical source of truth. */

export const measurementSessions = sqliteTable(
  'measurement_sessions',
  {
    id: text('id').primaryKey(),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    measuredAt: text('measured_at').notNull(),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_sessions_patient').on(table.patientId, table.measuredAt)],
);

export const measurementValues = sqliteTable(
  'measurement_values',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => measurementSessions.id),
    metric: text('metric', {
      enum: ['weight_kg', 'height_cm', 'waist_cm', 'hip_cm'],
    }).notNull(),
    value: real('value').notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.metric] })],
);

export const calculatedValues = sqliteTable(
  'calculated_values',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => measurementSessions.id),
    formulaId: text('formula_id').notNull(),
    formulaVersion: integer('formula_version').notNull(),
    inputsJson: text('inputs_json').notNull(),
    rawResult: real('raw_result').notNull(),
    roundedResult: real('rounded_result').notNull(),
    unit: text('unit').notNull(),
    warningsJson: text('warnings_json').notNull(),
  },
  (table) => [index('idx_calc_session').on(table.sessionId)],
);
