import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './schema';

/** Mirrors migration 0002 — migrations.ts remains the physical source of truth. */

export const consultations = sqliteTable(
  'consultations',
  {
    id: text('id').primaryKey(),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    consultationDate: text('consultation_date').notNull(),
    consultationType: text('consultation_type', {
      enum: ['initial', 'follow_up', 'other'],
    }).notNull(),
    subjective: text('subjective'),
    objective: text('objective'),
    assessment: text('assessment'),
    plan: text('plan'),
    status: text('status', { enum: ['draft', 'signed'] })
      .notNull()
      .default('draft'),
    signedAt: text('signed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [index('idx_consultations_patient').on(table.patientId, table.consultationDate)],
);

export const consultationAmendments = sqliteTable(
  'consultation_amendments',
  {
    id: text('id').primaryKey(),
    consultationId: text('consultation_id')
      .notNull()
      .references(() => consultations.id),
    reason: text('reason').notNull(),
    content: text('content').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_amendments_consultation').on(table.consultationId)],
);
