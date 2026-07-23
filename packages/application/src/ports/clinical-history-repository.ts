import type { ClinicalHistoryEntry } from '@ajnutrition/domain';

export interface ClinicalHistoryRepository {
  insert(entry: ClinicalHistoryEntry): void;
  findById(id: string): ClinicalHistoryEntry | null;
  listByPatient(patientId: string, includeSuperseded: boolean): ClinicalHistoryEntry[];
  /**
   * Marks an entry superseded. Implementations must guard with
   * `WHERE superseded_at IS NULL` and throw CONFLICT on zero affected rows —
   * two concurrent updates can never both win.
   */
  markSuperseded(id: string, supersededById: string, supersededAt: string): void;
}
