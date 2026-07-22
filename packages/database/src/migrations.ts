import { AppError } from '@ajnutrition/shared';
import type { SqliteDatabase } from './connection';

export interface Migration {
  /** Monotonically increasing, never reused, never edited after release. */
  id: number;
  name: string;
  up: string;
}

/**
 * Forward-only migration registry. SQL is embedded in code (not loose files)
 * so it survives ASAR packaging and cannot drift from the application version.
 *
 * Rules:
 *  - never modify a released migration; add a new one
 *  - destructive changes require a pre-migration backup (enforced by the
 *    caller in the main process before invoking runMigrations)
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: 'initial_patients_and_audit',
    up: `
      CREATE TABLE patients (
        id TEXT PRIMARY KEY,
        file_number INTEGER NOT NULL UNIQUE CHECK (file_number > 0),
        first_name TEXT NOT NULL CHECK (length(trim(first_name)) > 0),
        last_name TEXT NOT NULL CHECK (length(trim(last_name)) > 0),
        date_of_birth TEXT NOT NULL CHECK (date_of_birth GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        sex_at_birth TEXT NOT NULL CHECK (sex_at_birth IN ('female','male','unspecified')),
        email TEXT,
        phone TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT,
        version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)
      );

      CREATE INDEX idx_patients_names ON patients (last_name, first_name);
      CREATE INDEX idx_patients_status ON patients (status);

      CREATE TABLE audit_events (
        id TEXT PRIMARY KEY,
        occurred_at TEXT NOT NULL,
        actor TEXT NOT NULL DEFAULT 'practitioner',
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        result TEXT NOT NULL CHECK (result IN ('success','failure','denied')),
        app_version TEXT NOT NULL,
        metadata_json TEXT
      );

      CREATE INDEX idx_audit_entity ON audit_events (entity_type, entity_id);
      CREATE INDEX idx_audit_occurred ON audit_events (occurred_at);
    `,
  },
  {
    id: 2,
    name: 'consultations_with_amendments',
    up: `
      CREATE TABLE consultations (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id),
        consultation_date TEXT NOT NULL CHECK (consultation_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        consultation_type TEXT NOT NULL CHECK (consultation_type IN ('initial','follow_up','other')),
        subjective TEXT,
        objective TEXT,
        assessment TEXT,
        plan TEXT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','signed')),
        signed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
        CHECK ((status = 'signed') = (signed_at IS NOT NULL))
      );

      CREATE INDEX idx_consultations_patient ON consultations (patient_id, consultation_date);

      CREATE TABLE consultation_amendments (
        id TEXT PRIMARY KEY,
        consultation_id TEXT NOT NULL REFERENCES consultations(id),
        reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
        content TEXT NOT NULL CHECK (length(trim(content)) > 0),
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_amendments_consultation ON consultation_amendments (consultation_id);
    `,
  },
];

export interface MigrationReport {
  applied: Array<{ id: number; name: string }>;
  schemaVersion: number;
}

export function runMigrations(
  db: SqliteDatabase,
  migrations: readonly Migration[] = MIGRATIONS,
): MigrationReport {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedIds = new Set(
    (db.prepare('SELECT id FROM schema_migrations').all() as Array<{ id: number }>).map(
      (r) => r.id,
    ),
  );

  const sorted = [...migrations].sort((a, b) => a.id - b.id);
  const applied: Array<{ id: number; name: string }> = [];

  for (const migration of sorted) {
    if (appliedIds.has(migration.id)) continue;
    const apply = db.transaction(() => {
      db.exec(migration.up);
      db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(
        migration.id,
        migration.name,
        new Date().toISOString(),
      );
    });
    try {
      apply();
    } catch (err) {
      throw new AppError({
        code: 'MIGRATION',
        message: 'No fue posible actualizar la base de datos. No se realizaron cambios parciales.',
        internalDetail: `migration ${migration.id} (${migration.name}) failed: ${String(err)}`,
        cause: err,
      });
    }
    applied.push({ id: migration.id, name: migration.name });
  }

  const maxRow = db.prepare('SELECT MAX(id) AS max_id FROM schema_migrations').get() as {
    max_id: number | null;
  };
  return { applied, schemaVersion: maxRow.max_id ?? 0 };
}

/** Refuses to run against a database created by a NEWER application version. */
export function assertSchemaNotAhead(db: SqliteDatabase): void {
  const known = Math.max(...MIGRATIONS.map((m) => m.id));
  const tableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`)
    .get();
  if (!tableExists) return;
  const row = db.prepare('SELECT MAX(id) AS max_id FROM schema_migrations').get() as {
    max_id: number | null;
  };
  if ((row.max_id ?? 0) > known) {
    throw new AppError({
      code: 'MIGRATION',
      message:
        'Esta base de datos fue creada por una versión más reciente de AJNutrition. Actualice la aplicación.',
      internalDetail: `db schema ${row.max_id} > app schema ${known}`,
    });
  }
}
