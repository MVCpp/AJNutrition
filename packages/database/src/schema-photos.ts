import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './schema';

/** Mirrors migration 0005 — migrations.ts remains the physical source of truth. */

export const patientPhotos = sqliteTable(
  'patient_photos',
  {
    id: text('id').primaryKey(),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    kind: text('kind', { enum: ['front', 'side_left', 'side_right', 'back'] }).notNull(),
    capturedAt: text('captured_at').notNull(),
    originalFileName: text('original_file_name').notNull(),
    mimeType: text('mime_type', { enum: ['image/jpeg', 'image/png'] }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    storageName: text('storage_name').notNull().unique(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_photos_patient').on(table.patientId, table.kind, table.capturedAt)],
);
