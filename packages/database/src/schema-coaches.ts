import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { patients } from './schema';

/** Mirrors migration 32 — migrations.ts remains the physical source of truth. */

export const coaches = sqliteTable(
  'coaches',
  {
    id: text('id').primaryKey(),
    displayName: text('display_name').notNull(),
    organization: text('organization'),
    email: text('email'),
    phone: text('phone'),
    /** Commercial only (rates, gym, how they met) — never clinical content. */
    notes: text('notes'),
    status: text('status', { enum: ['active', 'archived'] }).notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    archivedAt: text('archived_at'),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    index('idx_coaches_name').on(table.displayName),
    index('idx_coaches_status').on(table.status),
  ],
);

/**
 * A referral fact: "this patient trains with Carlos". It authorises nothing —
 * permission to share anything with the trainer is a `third_party_transfer`
 * consent, added in C-2.
 */
export const patientCoachLinks = sqliteTable(
  'patient_coach_links',
  {
    id: text('id').primaryKey(),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    coachId: text('coach_id')
      .notNull()
      .references(() => coaches.id),
    linkedAt: text('linked_at').notNull(),
    revokedAt: text('revoked_at'),
    revokedReason: text('revoked_reason'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_patient_coach_patient').on(table.patientId, table.linkedAt),
    index('idx_patient_coach_coach').on(table.coachId),
    // Partial unique index: at most one active trainer per patient.
    uniqueIndex('idx_patient_coach_active')
      .on(table.patientId)
      .where(sql`revoked_at IS NULL`),
  ],
);
