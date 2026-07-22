import type { Patient } from '@ajnutrition/domain';

export interface PatientSearchCriteria {
  search?: string | undefined;
  includeArchived?: boolean | undefined;
}

/**
 * Persistence port for the Patient aggregate.
 *
 * Interfaces are synchronous by design: the only supported driver is
 * better-sqlite3, whose transactions require synchronous callbacks
 * (see ADR-0004). If an async driver is ever adopted, these ports change
 * in one deliberate migration rather than pretending to be async today.
 */
export interface PatientRepository {
  insert(patient: Patient): void;
  findById(id: string): Patient | null;
  search(criteria: PatientSearchCriteria): Patient[];
  /** Next sequential internal file number. Must be called inside a unit of work. */
  nextFileNumber(): number;
  /** Duplicate guard: same names + birth date among non-archived patients. */
  existsDuplicate(firstName: string, lastName: string, dateOfBirth: string): boolean;
}
