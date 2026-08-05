import type { Coach, PatientCoachLink } from '@ajnutrition/domain';

export interface CoachSearchCriteria {
  search?: string | undefined;
  includeArchived?: boolean | undefined;
}

/**
 * Persistence port for the Coach aggregate and the patient↔coach referral
 * link. Synchronous by design (ADR-0004).
 */
export interface CoachRepository {
  insert(coach: Coach): void;
  /** Optimistic concurrency: CONFLICT if the stored version moved on. */
  update(coach: Coach): void;
  findById(id: string): Coach | null;
  search(criteria: CoachSearchCriteria): Coach[];
  /** Duplicate guard among non-archived coaches, case-insensitive. */
  existsWithName(displayName: string, excludeId?: string): boolean;

  insertLink(link: PatientCoachLink): void;
  /**
   * Applies a revocation. Implementations must guard with
   * `WHERE revoked_at IS NULL` and throw CONFLICT on zero affected rows, so a
   * link can never be revoked twice even concurrently.
   */
  applyLinkRevocation(link: PatientCoachLink): void;
  findLinkById(id: string): PatientCoachLink | null;
  /** The patient's current trainer link, or null. At most one by construction. */
  activeLinkForPatient(patientId: string): PatientCoachLink | null;
  /** Full referral history for one patient, oldest first. */
  listLinksForPatient(patientId: string): PatientCoachLink[];
  /** Currently linked trainees of one coach. */
  listActiveLinksForCoach(coachId: string): PatientCoachLink[];
  /** Active trainee counts keyed by coach id; coaches with none are absent. */
  activeTraineeCounts(): Map<string, number>;
}
