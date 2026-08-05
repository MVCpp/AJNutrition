import { AppError } from '@ajnutrition/shared';
import type { DomainContext } from '../common/context';

export type CoachStatus = 'active' | 'archived';

/**
 * Coach aggregate (Referral bounded context, docs/product/coach-sharing.md).
 *
 * A personal trainer who sends several of their trainees to the practice for
 * meal plans. Deliberately NOT a patient and NOT a user of the app: a coach
 * has no credential, no session and can never write anything. The moment one
 * could, the practice would need concurrency, attribution and per-user audit,
 * and the local-first architecture would be over.
 *
 * `notes` is commercial — rates, which gym, how they met. Anything clinical
 * about a trainee belongs on the trainee's own record, which is the only place
 * it is encrypted, audited and exportable to the patient.
 */
export interface Coach {
  readonly id: string;
  readonly displayName: string;
  readonly organization: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly notes: string | null;
  readonly status: CoachStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
  /** Optimistic-concurrency version, incremented on every update. */
  readonly version: number;
}

export interface CoachDetailsInput {
  displayName: string;
  organization?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  notes?: string | undefined;
}

function assertValidDetails(input: CoachDetailsInput): void {
  if (input.displayName.trim().length === 0) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'Los datos del entrenador no son válidos.',
      fieldErrors: { displayName: ['required'] },
    });
  }
}

export function createCoach(input: CoachDetailsInput, ctx: DomainContext): Coach {
  assertValidDetails(input);
  const nowIso = ctx.now().toISOString();
  return {
    id: ctx.newId(),
    displayName: input.displayName.trim(),
    organization: input.organization?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    notes: input.notes?.trim() || null,
    status: 'active',
    createdAt: nowIso,
    updatedAt: nowIso,
    archivedAt: null,
    version: 1,
  };
}

export function updateCoachDetails(
  coach: Coach,
  input: CoachDetailsInput,
  ctx: DomainContext,
): Coach {
  assertValidDetails(input);
  return {
    ...coach,
    displayName: input.displayName.trim(),
    organization: input.organization?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    notes: input.notes?.trim() || null,
    updatedAt: ctx.now().toISOString(),
    version: coach.version + 1,
  };
}

/**
 * Archiving hides a coach from pickers and nothing else — existing links stay
 * exactly as they are, so a patient's referral history never rewrites itself
 * when a trainer stops working with the practice (the same rule foods and
 * recipes follow, threat model T-29). Reversible in both directions.
 */
export function setCoachStatus(coach: Coach, status: CoachStatus, ctx: DomainContext): Coach {
  if (coach.status === status) {
    throw new AppError({
      code: 'CONFLICT',
      message:
        status === 'archived'
          ? 'El entrenador ya está archivado.'
          : 'El entrenador ya está activo.',
    });
  }
  const nowIso = ctx.now().toISOString();
  return {
    ...coach,
    status,
    archivedAt: status === 'archived' ? nowIso : null,
    updatedAt: nowIso,
    version: coach.version + 1,
  };
}
