import { AppError } from '@ajnutrition/shared';
import type { DomainContext } from '../common/context';

/**
 * The referral between a patient and their trainer.
 *
 * **This authorises nothing.** It records that the practitioner knows the
 * patient trains with a particular coach — her own record-keeping, the same
 * kind of fact as knowing which doctor referred someone. Permission to send
 * that trainer anything about the patient is a separate, express
 * `third_party_transfer` consent given by the PATIENT, added in C-2.
 *
 * Keeping the two apart is deliberate. Folding them together would mean she
 * could not note who the trainer is without first producing a consent form,
 * and it would quietly turn an administrative note into a licence to share
 * clinical data.
 *
 * Append-only, revoke-only: a link is never edited or deleted, so "who was
 * their trainer in March" stays answerable. Changing trainer is a revoke plus
 * a link.
 */
export interface PatientCoachLink {
  readonly id: string;
  readonly patientId: string;
  readonly coachId: string;
  readonly linkedAt: string;
  readonly revokedAt: string | null;
  readonly revokedReason: string | null;
  readonly createdAt: string;
}

export function createPatientCoachLink(
  input: { patientId: string; coachId: string },
  ctx: DomainContext,
): PatientCoachLink {
  const nowIso = ctx.now().toISOString();
  return {
    id: ctx.newId(),
    patientId: input.patientId,
    coachId: input.coachId,
    linkedAt: nowIso,
    revokedAt: null,
    revokedReason: null,
    createdAt: nowIso,
  };
}

/** active → revoked. Revoking twice is a conflict, never a silent no-op. */
export function revokePatientCoachLink(
  link: PatientCoachLink,
  reason: string | undefined,
  ctx: DomainContext,
): PatientCoachLink {
  if (link.revokedAt !== null) {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Esta vinculación ya fue retirada.',
    });
  }
  return {
    ...link,
    revokedAt: ctx.now().toISOString(),
    revokedReason: reason?.trim() || null,
  };
}

/** The patient's current trainer, if any. At most one by construction. */
export function activePatientCoachLink(
  links: readonly PatientCoachLink[],
): PatientCoachLink | null {
  return links.find((link) => link.revokedAt === null) ?? null;
}
