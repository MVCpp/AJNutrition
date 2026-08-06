import { AppError } from '@ajnutrition/shared';
import type { DomainContext } from '../common/context';
import type { ConsentRecord } from '../consent/consent';
import type { PatientCoachLink } from './patient-coach-link';

/**
 * What a coach may be shown. Enumerated, never open-ended: the allow-list in
 * docs/product/coach-sharing.md §3 is the product decision, and every field
 * here had to pass "does a trainer program differently because of it?".
 *
 * Everything absent is absent on purpose — notes, history, medications,
 * allergies, labs and any diagnosis or interpretation are never shareable by
 * any combination of these flags.
 */
export interface ShareScope {
  readonly measurements: boolean;
  readonly bodyComposition: boolean;
  readonly planTargets: boolean;
  readonly adherence: boolean;
  /** Body photos to a non-clinical third party. Defaults off, always. */
  readonly photos: boolean;
}

export const EMPTY_SHARE_SCOPE: ShareScope = {
  measurements: false,
  bodyComposition: false,
  planTargets: false,
  adherence: false,
  photos: false,
};

/**
 * Permission to share one patient's progress with one coach.
 *
 * The grant cannot exist without `consentId`, and the database allows one
 * grant per consent, so a grant necessarily names a single coach. It is
 * append-only and revoke-only, like the consent it depends on.
 */
export interface CoachShareGrant {
  readonly id: string;
  readonly linkId: string;
  readonly consentId: string;
  readonly scope: ShareScope;
  readonly grantedAt: string;
  readonly revokedAt: string | null;
  readonly revokedReason: string | null;
  readonly createdAt: string;
}

export function scopeIsEmpty(scope: ShareScope): boolean {
  return !(
    scope.measurements ||
    scope.bodyComposition ||
    scope.planTargets ||
    scope.adherence ||
    scope.photos
  );
}

export function createCoachShareGrant(
  input: { linkId: string; consentId: string; scope: ShareScope },
  ctx: DomainContext,
): CoachShareGrant {
  if (scopeIsEmpty(input.scope)) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'Seleccione al menos un dato para compartir.',
      fieldErrors: { scope: ['required'] },
    });
  }
  const nowIso = ctx.now().toISOString();
  return {
    id: ctx.newId(),
    linkId: input.linkId,
    consentId: input.consentId,
    scope: input.scope,
    grantedAt: nowIso,
    revokedAt: null,
    revokedReason: null,
    createdAt: nowIso,
  };
}

/** live → revoked. Revoking twice is a conflict, never a silent no-op. */
export function revokeCoachShareGrant(
  grant: CoachShareGrant,
  reason: string | undefined,
  ctx: DomainContext,
): CoachShareGrant {
  if (grant.revokedAt !== null) {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Esta autorización ya fue retirada.',
    });
  }
  return {
    ...grant,
    revokedAt: ctx.now().toISOString(),
    revokedReason: reason?.trim() || null,
  };
}

export type ShareIneffectiveReason =
  | 'grant_revoked'
  | 'link_revoked'
  | 'consent_missing'
  | 'consent_wrong_type'
  | 'consent_wrong_patient'
  | 'consent_not_accepted';

export interface ShareDecision {
  readonly effective: boolean;
  readonly reason: ShareIneffectiveReason | null;
  /**
   * What may actually be shared right now. **Always empty when the decision is
   * not effective**, so a caller that forgets to check `effective` still
   * cannot share anything. The safe outcome must not depend on remembering to
   * ask the question the right way round.
   */
  readonly scope: ShareScope;
}

function refuse(reason: ShareIneffectiveReason): ShareDecision {
  return { effective: false, reason, scope: EMPTY_SHARE_SCOPE };
}

/**
 * The single rule that decides whether anything may be shared, evaluated on
 * every read from the three records it depends on.
 *
 * Deliberately NOT a stored flag. Withdrawing a consent has to stop the
 * sharing at that instant — not after a background job, a cache expiry or a
 * migration someone remembers to run. The patient who says "stop" has said
 * stop, and the only way to guarantee that is to derive the answer every time
 * from the consent itself.
 *
 * `consent` is passed in rather than looked up so this stays pure and the
 * caller cannot accidentally evaluate against a different patient's consent —
 * which is also why the patient id is checked here rather than trusted.
 */
export function evaluateCoachShare(
  grant: CoachShareGrant,
  link: PatientCoachLink,
  consent: ConsentRecord | null,
): ShareDecision {
  if (grant.revokedAt !== null) return refuse('grant_revoked');
  if (link.revokedAt !== null) return refuse('link_revoked');
  if (consent === null) return refuse('consent_missing');
  if (consent.consentType !== 'third_party_transfer') return refuse('consent_wrong_type');
  if (consent.patientId !== link.patientId) return refuse('consent_wrong_patient');
  if (consent.status !== 'accepted') return refuse('consent_not_accepted');
  return { effective: true, reason: null, scope: grant.scope };
}

/**
 * Guard for anything that is about to hand data to a coach (C-3 onwards).
 * Throws rather than returning a decision, so the failure mode of forgetting
 * to branch on it is a refusal, not a leak.
 */
export function assertShareAllowed(decision: ShareDecision): void {
  if (decision.effective) return;
  throw new AppError({
    code: 'AUTHORIZATION',
    message: 'No hay una autorización vigente para compartir con este entrenador.',
    internalDetail: `share refused: ${decision.reason ?? 'unknown'}`,
  });
}
