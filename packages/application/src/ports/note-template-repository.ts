export interface NoteTemplateRecord {
  id: string;
  name: string;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Reusable SOAP boilerplate. Practitioner-authored text that references no
 * patient — it becomes part of a record only when she inserts it herself.
 */
export interface NoteTemplateRepository {
  list(): NoteTemplateRecord[];
  findById(id: string): NoteTemplateRecord | null;
  upsert(record: NoteTemplateRecord): void;
  deleteById(id: string): void;
}
