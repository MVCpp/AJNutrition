# Entity-Relationship Design

## Implemented today (migration 0001)

```mermaid
erDiagram
  PATIENTS {
    text id PK "uuid v4"
    int file_number UK "sequential, > 0"
    text first_name "trimmed, non-empty"
    text last_name
    text date_of_birth "YYYY-MM-DD, CHECK glob"
    text sex_at_birth "female|male|unspecified"
    text email "nullable"
    text phone "nullable"
    text status "active|archived"
    text created_at "ISO UTC"
    text updated_at
    text archived_at "nullable"
    int version "optimistic concurrency"
  }
  AUDIT_EVENTS {
    text id PK
    text occurred_at
    text actor "practitioner (single-user today)"
    text action "verb.noun e.g. patient.create"
    text entity_type
    text entity_id "nullable"
    text result "success|failure|denied"
    text app_version
    text metadata_json "sanitized only"
  }
  SCHEMA_MIGRATIONS {
    int id PK
    text name
    text applied_at
  }
```

`audit_events.entity_id` intentionally has **no** foreign key to patients: audit history must survive entity deletion.

Indexes: `patients(last_name, first_name)`, `patients(status)`, `audit_events(entity_type, entity_id)`, `audit_events(occurred_at)`.

## Target model (Phases 2–6) — planning level

```mermaid
erDiagram
  PRACTITIONER ||--o{ PATIENTS : manages
  PATIENTS ||--o{ CONSENTS : grants
  PATIENTS ||--o{ CLINICAL_HISTORY_ENTRIES : has "temporal, never overwritten"
  PATIENTS ||--o{ APPOINTMENTS : schedules
  APPOINTMENTS |o--o| CONSULTATIONS : produces
  CONSULTATIONS ||--o{ CONSULTATION_AMENDMENTS : amended_by "signed notes immutable"
  PATIENTS ||--o{ MEASUREMENT_SESSIONS : measured_in
  MEASUREMENT_SESSIONS ||--o{ MEASUREMENTS_RAW : records
  MEASUREMENT_SESSIONS ||--o{ CALCULATED_VALUES : derives "formula id+version+inputs"
  PATIENTS ||--o{ LAB_RESULT_SETS : has
  LAB_RESULT_SETS ||--o{ LAB_RESULTS : contains "per-lab reference ranges"
  FOODS ||--o{ FOOD_NUTRIENT_VALUES : has "basis qty+unit explicit"
  NUTRIENT_DEFINITIONS ||--o{ FOOD_NUTRIENT_VALUES : defines
  FOODS ||--o{ SERVING_CONVERSIONS : measured_by
  DATASET_MANIFESTS ||--o{ FOODS : sources "license + version + hash"
  RECIPES ||--o{ RECIPE_INGREDIENTS : contains
  FOODS ||--o{ RECIPE_INGREDIENTS : referenced_by
  PATIENTS ||--o{ MEAL_PLANS : receives
  MEAL_PLANS ||--o{ MEAL_PLAN_DAYS : has
  MEAL_PLAN_DAYS ||--o{ PLANNED_MEALS : has
  PLANNED_MEALS ||--o{ PLAN_ITEMS : contains "food|recipe|instruction"
  PATIENTS ||--o{ NUTRITION_TARGETS : targeted_by
  PATIENTS ||--o{ PROGRESS_ENTRIES : reports
  MEAL_PLANS ||--o{ ADHERENCE_RECORDS : tracked_by
  PATIENTS ||--o{ ATTACHMENTS : owns "hash, MIME-verified, encrypted"
```

Design rules carried into every future migration:

1. Raw values and calculated values are separate tables; calculations carry formula id + version + inputs (reproducibility).
2. Nutrient values always carry basis quantity + basis unit + source + confidence; missing ≠ zero.
3. Signed consultations are immutable; changes are amendment rows with author/timestamp/reason.
4. Temporal clinical history: new rows supersede, never UPDATE-in-place.
5. Soft delete/archival distinct from irreversible deletion; deletion workflows record audit events.
6. Every dataset-derived row keeps `source_id`/`source_version` for provenance.
