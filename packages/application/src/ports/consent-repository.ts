import type { ConsentRecord } from '@ajnutrition/domain';

export interface ConsentRepository {
  insert(record: ConsentRecord): void;
  findById(id: string): ConsentRecord | null;
  listByPatient(patientId: string): ConsentRecord[];
  /**
   * Applies a withdrawal. Implementations must guard with
   * `WHERE status = 'accepted'` and throw CONFLICT on zero affected rows —
   * a consent can never be withdrawn twice, even concurrently.
   */
  applyWithdrawal(record: ConsentRecord): void;
}
