import type { NoteTemplateRecord, NoteTemplateRepository } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';

interface Row {
  id: string;
  name: string;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  created_at: string;
  updated_at: string;
}

const toRecord = (row: Row): NoteTemplateRecord => ({
  id: row.id,
  name: row.name,
  subjective: row.subjective,
  objective: row.objective,
  assessment: row.assessment,
  plan: row.plan,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Small, rarely-changing table — plain SQL is clearer than a query builder. */
export class SqliteNoteTemplateRepository implements NoteTemplateRepository {
  constructor(private readonly db: SqliteDatabase) {}

  list(): NoteTemplateRecord[] {
    return (
      this.db.prepare('SELECT * FROM note_templates ORDER BY lower(trim(name))').all() as Row[]
    ).map(toRecord);
  }

  findById(id: string): NoteTemplateRecord | null {
    const row = this.db.prepare('SELECT * FROM note_templates WHERE id = ?').get(id) as
      Row | undefined;
    return row ? toRecord(row) : null;
  }

  upsert(record: NoteTemplateRecord): void {
    this.db
      .prepare(
        `INSERT INTO note_templates (id, name, subjective, objective, assessment, plan,
                                     created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           subjective = excluded.subjective,
           objective = excluded.objective,
           assessment = excluded.assessment,
           plan = excluded.plan,
           updated_at = excluded.updated_at`,
      )
      .run(
        record.id,
        record.name,
        record.subjective,
        record.objective,
        record.assessment,
        record.plan,
        record.createdAt,
        record.updatedAt,
      );
  }

  deleteById(id: string): void {
    this.db.prepare('DELETE FROM note_templates WHERE id = ?').run(id);
  }
}
