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
  {
    id: 3,
    name: 'clinical_history_entries',
    up: `
      CREATE TABLE clinical_history_entries (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id),
        category TEXT NOT NULL CHECK (category IN (
          'allergy','intolerance','pathological','non_pathological','family',
          'medication','supplement','surgery','dietary_pattern',
          'physical_activity','preference','other'
        )),
        content TEXT NOT NULL CHECK (length(trim(content)) > 0),
        superseded_at TEXT,
        superseded_by_id TEXT REFERENCES clinical_history_entries(id),
        created_at TEXT NOT NULL,
        CHECK ((superseded_at IS NULL) = (superseded_by_id IS NULL))
      );

      CREATE INDEX idx_history_patient ON clinical_history_entries (patient_id, category);
    `,
  },
  {
    id: 4,
    name: 'consent_records',
    up: `
      CREATE TABLE consent_records (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id),
        consent_type TEXT NOT NULL CHECK (consent_type IN (
          'data_processing','photo','ai_processing','communications','third_party_transfer'
        )),
        notice_version TEXT NOT NULL CHECK (length(trim(notice_version)) > 0),
        status TEXT NOT NULL CHECK (status IN ('accepted','declined','withdrawn')),
        method TEXT NOT NULL CHECK (method IN ('verbal','written','digital')),
        decided_at TEXT NOT NULL,
        withdrawn_at TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        CHECK ((status = 'withdrawn') = (withdrawn_at IS NOT NULL))
      );

      CREATE INDEX idx_consents_patient ON consent_records (patient_id, consent_type);
    `,
  },
  {
    id: 5,
    name: 'patient_photos',
    up: `
      CREATE TABLE patient_photos (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id),
        kind TEXT NOT NULL CHECK (kind IN ('front','side_left','side_right','back')),
        captured_at TEXT NOT NULL CHECK (captured_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        original_file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg','image/png')),
        size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
        sha256 TEXT NOT NULL,
        storage_name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_photos_patient ON patient_photos (patient_id, kind, captured_at);
    `,
  },
  {
    id: 6,
    name: 'measurement_sessions',
    up: `
      CREATE TABLE measurement_sessions (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id),
        measured_at TEXT NOT NULL CHECK (measured_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        notes TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_sessions_patient ON measurement_sessions (patient_id, measured_at);

      -- Raw values, stored separately from anything calculated (section 12.7).
      CREATE TABLE measurement_values (
        session_id TEXT NOT NULL REFERENCES measurement_sessions(id),
        metric TEXT NOT NULL CHECK (metric IN ('weight_kg','height_cm','waist_cm','hip_cm')),
        value REAL NOT NULL CHECK (value > 0),
        PRIMARY KEY (session_id, metric)
      );

      -- Calculated results frozen with full provenance: formula id + version
      -- + exact inputs. Historical results never change when formulas update.
      CREATE TABLE calculated_values (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES measurement_sessions(id),
        formula_id TEXT NOT NULL,
        formula_version INTEGER NOT NULL CHECK (formula_version >= 1),
        inputs_json TEXT NOT NULL,
        raw_result REAL NOT NULL,
        rounded_result REAL NOT NULL,
        unit TEXT NOT NULL,
        warnings_json TEXT NOT NULL
      );

      CREATE INDEX idx_calc_session ON calculated_values (session_id);
    `,
  },
  {
    id: 7,
    name: 'foods_with_nutrient_values',
    up: `
      CREATE TABLE foods (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        name_normalized TEXT NOT NULL,
        brand TEXT,
        category TEXT,
        source TEXT NOT NULL DEFAULT 'custom' CHECK (source IN ('custom','fdc','import')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_foods_normalized ON foods (name_normalized);

      -- Nutrient values ALWAYS carry their basis explicitly (section 12.11):
      -- a value without its basis is meaningless.
      CREATE TABLE food_nutrient_values (
        food_id TEXT NOT NULL REFERENCES foods(id),
        nutrient_id TEXT NOT NULL,
        amount REAL NOT NULL CHECK (amount >= 0),
        basis_grams REAL NOT NULL DEFAULT 100 CHECK (basis_grams > 0),
        PRIMARY KEY (food_id, nutrient_id)
      );
    `,
  },
  {
    id: 8,
    name: 'food_servings_and_recipes',
    up: `
      -- Household measures (section 12.12): '1 pieza' = N grams, explicit always.
      CREATE TABLE food_servings (
        id TEXT PRIMARY KEY,
        food_id TEXT NOT NULL REFERENCES foods(id),
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        grams REAL NOT NULL CHECK (grams > 0),
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_servings_food ON food_servings (food_id);

      CREATE TABLE recipes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        name_normalized TEXT NOT NULL,
        description TEXT,
        yield_portions REAL NOT NULL CHECK (yield_portions > 0),
        instructions TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_recipes_normalized ON recipes (name_normalized);

      CREATE TABLE recipe_ingredients (
        recipe_id TEXT NOT NULL REFERENCES recipes(id),
        food_id TEXT NOT NULL REFERENCES foods(id),
        grams REAL NOT NULL CHECK (grams > 0),
        display_order INTEGER NOT NULL,
        PRIMARY KEY (recipe_id, food_id)
      );
    `,
  },
  {
    id: 9,
    name: 'meal_plans',
    up: `
      CREATE TABLE meal_plans (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id),
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        days INTEGER NOT NULL CHECK (days BETWEEN 1 AND 7),
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
        energy_target_kcal REAL NOT NULL CHECK (energy_target_kcal > 0),
        protein_target_g REAL NOT NULL CHECK (protein_target_g >= 0),
        carbohydrate_target_g REAL NOT NULL CHECK (carbohydrate_target_g >= 0),
        fat_target_g REAL NOT NULL CHECK (fat_target_g >= 0),
        -- Frozen provenance: session, formulas+versions, PAL, adjustment.
        target_source_json TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_plans_patient ON meal_plans (patient_id, created_at);

      CREATE TABLE plan_items (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL REFERENCES meal_plans(id),
        day_index INTEGER NOT NULL CHECK (day_index >= 0),
        meal_slot TEXT NOT NULL CHECK (meal_slot IN ('breakfast','snack1','lunch','snack2','dinner')),
        item_type TEXT NOT NULL CHECK (item_type IN ('food','recipe')),
        food_id TEXT REFERENCES foods(id),
        recipe_id TEXT REFERENCES recipes(id),
        grams REAL CHECK (grams IS NULL OR grams > 0),
        portions REAL CHECK (portions IS NULL OR portions > 0),
        display_order INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        CHECK ((item_type = 'food') = (food_id IS NOT NULL AND grams IS NOT NULL)),
        CHECK ((item_type = 'recipe') = (recipe_id IS NOT NULL AND portions IS NOT NULL))
      );

      CREATE INDEX idx_plan_items_plan ON plan_items (plan_id, day_index, meal_slot, display_order);
    `,
  },
  {
    id: 10,
    name: 'practitioner_profile',
    up: `
      -- Single-row practitioner profile (section 12.1): feeds report headers.
      CREATE TABLE practitioner_profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        full_name TEXT NOT NULL CHECK (length(trim(full_name)) > 0),
        title TEXT,
        license TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        logo_base64 TEXT,
        logo_mime TEXT CHECK (logo_mime IS NULL OR logo_mime IN ('image/png','image/jpeg')),
        updated_at TEXT NOT NULL,
        CHECK ((logo_base64 IS NULL) = (logo_mime IS NULL))
      );
    `,
  },
  {
    id: 11,
    name: 'measurement_body_fat_percent',
    up: `
      -- SQLite cannot alter a CHECK constraint: rebuild measurement_values
      -- with body_fat_percent added to the allowed metric list.
      CREATE TABLE measurement_values_new (
        session_id TEXT NOT NULL REFERENCES measurement_sessions(id),
        metric TEXT NOT NULL CHECK (metric IN ('weight_kg','height_cm','waist_cm','hip_cm','body_fat_percent')),
        value REAL NOT NULL CHECK (value > 0),
        PRIMARY KEY (session_id, metric)
      );
      INSERT INTO measurement_values_new SELECT session_id, metric, value FROM measurement_values;
      DROP TABLE measurement_values;
      ALTER TABLE measurement_values_new RENAME TO measurement_values;
    `,
  },
  {
    id: 12,
    name: 'consultation_links',
    up: `
      -- One patient → many consultations; a consultation may own a meal plan
      -- and its progress photos. Optional: pre-existing rows stay unlinked.
      ALTER TABLE meal_plans ADD COLUMN consultation_id TEXT REFERENCES consultations(id);
      ALTER TABLE patient_photos ADD COLUMN consultation_id TEXT REFERENCES consultations(id);
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
