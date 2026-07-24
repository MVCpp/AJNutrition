import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './schema';
import { consultations } from './schema-consultations';

/** Mirrors migration 0017 — migrations.ts remains the physical source of truth. */

export const appointments = sqliteTable(
  'appointments',
  {
    id: text('id').primaryKey(),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    scheduledAt: text('scheduled_at').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    reason: text('reason'),
    status: text('status', { enum: ['scheduled', 'completed', 'cancelled', 'no_show'] })
      .notNull()
      .default('scheduled'),
    consultationId: text('consultation_id').references(() => consultations.id),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_appointments_when').on(table.scheduledAt),
    index('idx_appointments_patient').on(table.patientId),
  ],
);
