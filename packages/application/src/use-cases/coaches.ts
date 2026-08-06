import {
  activePatientCoachLink,
  createCoach,
  currentConsentByType,
  assertShareAllowed,
  createCoachShareGrant,
  evaluateCoachShare,
  type ShareScope,
  revokeCoachShareGrant,
  type CoachShareGrant,
  type ConsentRecord,
  createPatientCoachLink,
  revokePatientCoachLink,
  setCoachStatus,
  updateCoachDetails,
  type Coach,
  type DomainContext,
  type PatientCoachLink,
} from '@ajnutrition/domain';
import {
  AppError,
  type CoachDetailDto,
  type CoachDto,
  type AdherenceEntryDto,
  type CoachPackSkipDto,
  type CoachReportDataDto,
  type CoachReportMetricDto,
  type CoachShareGrantDto,
  type ExportCoachPackCommand,
  type ExportCoachReportCommand,
  type MealPlanDto,
  type MealPlanSummaryDto,
  type MeasurementSessionDto,
  type PhotoDto,
  type GrantCoachShareCommand,
  type ListCoachSharesQuery,
  type PatientSharingDto,
  type RevokeCoachShareCommand,
  type CreateCoachCommand,
  type GetCoachQuery,
  type GetPatientCoachQuery,
  type LinkPatientToCoachCommand,
  type ListCoachesQuery,
  type PatientCoachLinkDto,
  type RevokeCoachLinkCommand,
  type SetCoachStatusCommand,
  type UpdateCoachCommand,
} from '@ajnutrition/shared';
import type { AuditLog } from '../ports/audit-log';
import type { CoachRepository, CoachShareRepository } from '../ports/coach-repository';
import type { ConsentRepository } from '../ports/consent-repository';
import type { PatientRepository } from '../ports/patient-repository';
import type { UnitOfWork } from '../ports/unit-of-work';
import { toPatientDto } from '../mappers/patient-mapper';

/**
 * Coach use cases (docs/product/coach-sharing.md, C-1).
 *
 * Everything here is the practitioner's own record of who trains with whom.
 * Nothing in this file sends anything anywhere, and nothing in it reads a
 * measurement, a plan or a clinical note — linking a patient to their trainer
 * is an administrative fact, not permission to share their record. That
 * permission is an express `third_party_transfer` consent (C-2).
 *
 * Audit metadata therefore carries ids and counts only, never clinical values,
 * and never the coach's free-text notes.
 */

export interface CoachDeps {
  uow: UnitOfWork;
  coaches: CoachRepository;
  patients: PatientRepository;
  audit: AuditLog;
  ctx: DomainContext;
}

function toDto(coach: Coach, activeTraineeCount: number): CoachDto {
  return {
    id: coach.id,
    displayName: coach.displayName,
    organization: coach.organization,
    email: coach.email,
    phone: coach.phone,
    notes: coach.notes,
    status: coach.status,
    activeTraineeCount,
    createdAt: coach.createdAt,
    updatedAt: coach.updatedAt,
  };
}

function toLinkDto(link: PatientCoachLink, coach: Coach): PatientCoachLinkDto {
  return {
    id: link.id,
    patientId: link.patientId,
    coachId: link.coachId,
    coachDisplayName: coach.displayName,
    coachStatus: coach.status,
    linkedAt: link.linkedAt,
    revokedAt: link.revokedAt,
    revokedReason: link.revokedReason,
  };
}

export class CreateCoachUseCase {
  constructor(private readonly deps: CoachDeps) {}

  execute(command: CreateCoachCommand): CoachDto {
    const { uow, coaches, audit, ctx } = this.deps;
    return uow.run(() => {
      if (coaches.existsWithName(command.displayName.trim())) {
        throw new AppError({
          code: 'CONFLICT',
          message: 'Ya existe un entrenador con ese nombre.',
          fieldErrors: { displayName: ['duplicate'] },
        });
      }
      const coach = createCoach(command, ctx);
      coaches.insert(coach);
      audit.record({
        action: 'coach.create',
        entityType: 'coach',
        entityId: coach.id,
        result: 'success',
        metadata: { hasOrganization: coach.organization !== null },
      });
      return toDto(coach, 0);
    });
  }
}

export class UpdateCoachUseCase {
  constructor(private readonly deps: CoachDeps) {}

  execute(command: UpdateCoachCommand): CoachDto {
    const { uow, coaches, audit, ctx } = this.deps;
    return uow.run(() => {
      const existing = coaches.findById(command.coachId);
      if (existing === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Entrenador no encontrado.' });
      }
      if (coaches.existsWithName(command.displayName.trim(), existing.id)) {
        throw new AppError({
          code: 'CONFLICT',
          message: 'Ya existe un entrenador con ese nombre.',
          fieldErrors: { displayName: ['duplicate'] },
        });
      }
      const updated = updateCoachDetails(existing, command, ctx);
      coaches.update(updated);
      audit.record({
        action: 'coach.update',
        entityType: 'coach',
        entityId: updated.id,
        result: 'success',
        metadata: { version: updated.version },
      });
      return toDto(updated, coaches.listActiveLinksForCoach(updated.id).length);
    });
  }
}

/**
 * Archive/restore. Archiving hides the coach from pickers and does NOT revoke
 * anyone's link: a patient's referral history must not rewrite itself because
 * a trainer stopped working with the practice (same rule as T-29 for foods).
 */
export class SetCoachStatusUseCase {
  constructor(private readonly deps: CoachDeps) {}

  execute(command: SetCoachStatusCommand): CoachDto {
    const { uow, coaches, audit, ctx } = this.deps;
    return uow.run(() => {
      const existing = coaches.findById(command.coachId);
      if (existing === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Entrenador no encontrado.' });
      }
      const updated = setCoachStatus(existing, command.status, ctx);
      coaches.update(updated);
      const activeTrainees = coaches.listActiveLinksForCoach(updated.id).length;
      audit.record({
        action: command.status === 'archived' ? 'coach.archive' : 'coach.restore',
        entityType: 'coach',
        entityId: updated.id,
        result: 'success',
        // Counts only: how many links survive the archive is worth knowing,
        // who they belong to is not this record's business.
        metadata: { activeTrainees },
      });
      return toDto(updated, activeTrainees);
    });
  }
}

export class ListCoachesUseCase {
  constructor(private readonly deps: Pick<CoachDeps, 'coaches'>) {}

  execute(query: ListCoachesQuery): CoachDto[] {
    const { coaches } = this.deps;
    const counts = coaches.activeTraineeCounts();
    return coaches
      .search({ search: query.search, includeArchived: query.includeArchived ?? false })
      .map((coach) => toDto(coach, counts.get(coach.id) ?? 0));
  }
}

/** A coach and their current trainees — identity only, no clinical data. */
export class GetCoachUseCase {
  constructor(private readonly deps: Pick<CoachDeps, 'coaches' | 'patients'>) {}

  execute(query: GetCoachQuery): CoachDetailDto {
    const { coaches, patients } = this.deps;
    const coach = coaches.findById(query.coachId);
    if (coach === null) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Entrenador no encontrado.' });
    }
    const links = coaches.listActiveLinksForCoach(coach.id);
    const trainees = links.flatMap((link) => {
      const patient = patients.findById(link.patientId);
      return patient === null
        ? []
        : [{ linkId: link.id, linkedAt: link.linkedAt, patient: toPatientDto(patient) }];
    });
    return { coach: toDto(coach, links.length), trainees };
  }
}

export class LinkPatientToCoachUseCase {
  constructor(private readonly deps: CoachDeps) {}

  execute(command: LinkPatientToCoachCommand): PatientCoachLinkDto {
    const { uow, coaches, patients, audit, ctx } = this.deps;
    return uow.run(() => {
      if (patients.findById(command.patientId) === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Paciente no encontrado.' });
      }
      const coach = coaches.findById(command.coachId);
      if (coach === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Entrenador no encontrado.' });
      }
      if (coach.status === 'archived') {
        throw new AppError({
          code: 'CONFLICT',
          message: 'Este entrenador está archivado. Restáurelo antes de vincular pacientes.',
        });
      }
      // One trainer at a time. The database enforces this too (partial unique
      // index in migration 32); checking here buys a message she can act on
      // instead of a constraint violation.
      if (coaches.activeLinkForPatient(command.patientId) !== null) {
        throw new AppError({
          code: 'CONFLICT',
          message:
            'Este paciente ya está vinculado a un entrenador. Retire la vinculación antes de crear otra.',
        });
      }
      const link = createPatientCoachLink(command, ctx);
      coaches.insertLink(link);
      audit.record({
        action: 'coach.link',
        entityType: 'patient_coach_link',
        entityId: link.id,
        result: 'success',
        metadata: { patientId: link.patientId, coachId: link.coachId },
      });
      return toLinkDto(link, coach);
    });
  }
}

export class RevokeCoachLinkUseCase {
  constructor(private readonly deps: CoachDeps) {}

  execute(command: RevokeCoachLinkCommand): PatientCoachLinkDto {
    const { uow, coaches, audit, ctx } = this.deps;
    return uow.run(() => {
      const link = coaches.findLinkById(command.linkId);
      if (link === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Vinculación no encontrada.' });
      }
      const coach = coaches.findById(link.coachId);
      if (coach === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Entrenador no encontrado.' });
      }
      const revoked = revokePatientCoachLink(link, command.reason, ctx);
      coaches.applyLinkRevocation(revoked);
      audit.record({
        action: 'coach.unlink',
        entityType: 'patient_coach_link',
        entityId: revoked.id,
        result: 'success',
        // The reason is free text she typed; it stays on the row, not in the
        // audit log, which must never become a place free text accumulates.
        metadata: { patientId: revoked.patientId, coachId: revoked.coachId },
      });
      return toLinkDto(revoked, coach);
    });
  }
}

/** The patient's current trainer, or null. Used by the patient page. */
export class GetPatientCoachUseCase {
  constructor(private readonly deps: Pick<CoachDeps, 'coaches'>) {}

  execute(query: GetPatientCoachQuery): PatientCoachLinkDto | null {
    const { coaches } = this.deps;
    const link = activePatientCoachLink(coaches.listLinksForPatient(query.patientId));
    if (link === null) return null;
    const coach = coaches.findById(link.coachId);
    return coach === null ? null : toLinkDto(link, coach);
  }
}

/**
 * Full referral history for one patient, including revoked links.
 *
 * Feeds the patient export: "you recorded that I train with Carlos" is
 * personal data about the patient, so an ARCO access request has to surface
 * it. Unlike the coach-facing views this is not filtered — the patient is
 * entitled to the whole history, not the current state.
 */
export class ListPatientCoachLinksUseCase {
  constructor(private readonly deps: Pick<CoachDeps, 'coaches'>) {}

  execute(query: GetPatientCoachQuery): PatientCoachLinkDto[] {
    const { coaches } = this.deps;
    return coaches.listLinksForPatient(query.patientId).flatMap((link) => {
      const coach = coaches.findById(link.coachId);
      return coach === null ? [] : [toLinkDto(link, coach)];
    });
  }
}

/**
 * Sharing authorisations (C-2) — the only thing in the app that permits
 * sending a coach anything about a patient.
 *
 * Two rules are enforced here rather than trusted to the UI:
 *
 *  * The consent must be an ACCEPTED `third_party_transfer` belonging to this
 *    patient. A UI check is a suggestion; this is a rule.
 *  * One consent authorises one grant, so a consent necessarily names a single
 *    coach. The database enforces it too (unique index, migration 33);
 *    checking here buys a message she can act on.
 *
 * Effectiveness is never stored. Every read re-derives it from the grant, the
 * referral and the consent, so withdrawing a consent stops the sharing at that
 * instant rather than whenever something remembers to clear a flag.
 */
export interface CoachShareDeps extends CoachDeps {
  shares: CoachShareRepository;
  consents: ConsentRepository;
}

/**
 * The patient's current `photo` consent, or null.
 *
 * Read on every evaluation rather than cached with the grant, for the same
 * reason effectiveness is never stored: a withdrawal has to bite immediately.
 */
function livePhotoConsent(consents: ConsentRepository, patientId: string): ConsentRecord | null {
  return currentConsentByType(consents.listByPatient(patientId)).get('photo') ?? null;
}

function toGrantDto(
  grant: CoachShareGrant,
  link: PatientCoachLink,
  coach: Coach,
  consent: ConsentRecord | null,
  photoConsent: ConsentRecord | null,
): CoachShareGrantDto {
  const decision = evaluateCoachShare(grant, link, consent, photoConsent);
  return {
    id: grant.id,
    linkId: grant.linkId,
    consentId: grant.consentId,
    coachId: coach.id,
    coachDisplayName: coach.displayName,
    scope: grant.scope,
    effectiveScope: decision.scope,
    effective: decision.effective,
    reason: decision.reason,
    grantedAt: grant.grantedAt,
    revokedAt: grant.revokedAt,
    revokedReason: grant.revokedReason,
  };
}

export class GrantCoachShareUseCase {
  constructor(private readonly deps: CoachShareDeps) {}

  execute(command: GrantCoachShareCommand): CoachShareGrantDto {
    const { uow, coaches, shares, consents, audit, ctx } = this.deps;
    return uow.run(() => {
      const link = coaches.findLinkById(command.linkId);
      if (link === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Vinculación no encontrada.' });
      }
      if (link.revokedAt !== null) {
        throw new AppError({
          code: 'CONFLICT',
          message: 'Esta vinculación fue retirada. Vincule al paciente de nuevo.',
        });
      }
      const coach = coaches.findById(link.coachId);
      if (coach === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Entrenador no encontrado.' });
      }

      const consent = consents.findById(command.consentId);
      if (consent === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Consentimiento no encontrado.' });
      }
      if (consent.patientId !== link.patientId) {
        throw new AppError({
          code: 'VALIDATION',
          message: 'El consentimiento pertenece a otro paciente.',
        });
      }
      if (consent.consentType !== 'third_party_transfer') {
        throw new AppError({
          code: 'VALIDATION',
          message:
            'Se requiere un consentimiento de transferencia a terceros. Ningún otro tipo autoriza compartir con un entrenador.',
        });
      }
      if (consent.status !== 'accepted') {
        throw new AppError({
          code: 'CONFLICT',
          message: 'Ese consentimiento no está vigente.',
        });
      }
      if (shares.consentAlreadyUsed(consent.id)) {
        throw new AppError({
          code: 'CONFLICT',
          message:
            'Ese consentimiento ya autorizó otra vinculación. Registre un consentimiento nuevo para este entrenador.',
        });
      }
      if (shares.liveGrantForLink(link.id) !== null) {
        throw new AppError({
          code: 'CONFLICT',
          message: 'Ya existe una autorización vigente para este entrenador.',
        });
      }

      const grant = createCoachShareGrant(
        { linkId: link.id, consentId: consent.id, scope: command.scope },
        ctx,
      );
      shares.insertGrant(grant);
      audit.record({
        action: 'coach.share.grant',
        entityType: 'coach_share_grant',
        entityId: grant.id,
        result: 'success',
        // Which categories were authorised is the point of the record; no
        // clinical value and no free text ever enters it.
        metadata: {
          patientId: link.patientId,
          coachId: coach.id,
          consentId: consent.id,
          noticeVersion: consent.noticeVersion,
          measurements: grant.scope.measurements,
          bodyComposition: grant.scope.bodyComposition,
          planTargets: grant.scope.planTargets,
          adherence: grant.scope.adherence,
          photos: grant.scope.photos,
        },
      });
      return toGrantDto(grant, link, coach, consent, livePhotoConsent(consents, link.patientId));
    });
  }
}

export class RevokeCoachShareUseCase {
  constructor(private readonly deps: CoachShareDeps) {}

  execute(command: RevokeCoachShareCommand): CoachShareGrantDto {
    const { uow, coaches, shares, consents, audit, ctx } = this.deps;
    return uow.run(() => {
      const grant = shares.findGrantById(command.grantId);
      if (grant === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Autorización no encontrada.' });
      }
      const link = coaches.findLinkById(grant.linkId);
      const coach = link === null ? null : coaches.findById(link.coachId);
      if (link === null || coach === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Vinculación no encontrada.' });
      }
      const revoked = revokeCoachShareGrant(grant, command.reason, ctx);
      shares.applyGrantRevocation(revoked);
      audit.record({
        action: 'coach.share.revoke',
        entityType: 'coach_share_grant',
        entityId: revoked.id,
        result: 'success',
        metadata: { patientId: link.patientId, coachId: coach.id },
      });
      return toGrantDto(
        revoked,
        link,
        coach,
        consents.findById(revoked.consentId),
        livePhotoConsent(consents, link.patientId),
      );
    });
  }
}

/**
 * Everything the patient's sharing panel needs: every authorisation ever made
 * about them with its live effectiveness, plus the consents that could
 * authorise a new one.
 *
 * The grant history is the answer to "who has been allowed to see my data?",
 * which is an ARCO access right — a question she must be able to answer with
 * the patient in front of her, not one she has to go and research.
 */
export class GetPatientSharingUseCase {
  constructor(private readonly deps: Pick<CoachShareDeps, 'coaches' | 'shares' | 'consents'>) {}

  execute(query: ListCoachSharesQuery): PatientSharingDto {
    const { coaches, shares, consents } = this.deps;

    const photoConsent = livePhotoConsent(consents, query.patientId);
    const grants = shares.listGrantsForPatient(query.patientId).flatMap((grant) => {
      const link = coaches.findLinkById(grant.linkId);
      const coach = link === null ? null : coaches.findById(link.coachId);
      if (link === null || coach === null) return [];
      return [toGrantDto(grant, link, coach, consents.findById(grant.consentId), photoConsent)];
    });

    const eligibleConsents = consents
      .listByPatient(query.patientId)
      .filter(
        (consent) =>
          consent.consentType === 'third_party_transfer' &&
          consent.status === 'accepted' &&
          !shares.consentAlreadyUsed(consent.id),
      )
      .map((consent) => ({
        consentId: consent.id,
        noticeVersion: consent.noticeVersion,
        method: consent.method,
        decidedAt: consent.decidedAt,
      }));

    return { grants, eligibleConsents };
  }
}

/**
 * Building the document a coach receives (C-3).
 *
 * The scope is applied HERE, not at render time. Every metric, target and
 * photo id is included only if the live decision allows it, so an out-of-scope
 * value never reaches the DTO and no renderer can widen it by accident. The
 * decision is the same `evaluateCoachShare` the panel shows, re-derived at the
 * moment of generation — a consent withdrawn thirty seconds ago stops this.
 */

/** Raw anthropometry: what `measurements` covers. */
const MEASUREMENT_METRICS = [
  { label: 'Peso (kg)', decimals: 1, read: (s: MeasurementSessionDto) => s.weightKg },
  { label: 'Cintura (cm)', decimals: 1, read: (s: MeasurementSessionDto) => s.waistCm },
  { label: 'Cadera (cm)', decimals: 1, read: (s: MeasurementSessionDto) => s.hipCm },
] as const;

/** Derived composition: what `bodyComposition` covers. */
const BODY_COMPOSITION_METRICS = [
  {
    label: 'Grasa corporal (%)',
    decimals: 1,
    read: (s: MeasurementSessionDto) => s.bodyFatPercent,
  },
  {
    label: 'Masa muscular esquelética (kg)',
    decimals: 1,
    read: (s: MeasurementSessionDto) => s.skeletalMuscleMassKg,
  },
  { label: 'Masa grasa (kg)', decimals: 1, read: (s: MeasurementSessionDto) => s.fatMassKg },
] as const;

const SCOPE_LABELS: Record<keyof ShareScope, string> = {
  measurements: 'mediciones y peso',
  bodyComposition: 'composición corporal',
  planTargets: 'metas del plan',
  adherence: 'adherencia',
  photos: 'fotografías de progreso',
};

export function shareScopeLabels(scope: ShareScope): string[] {
  return (Object.keys(SCOPE_LABELS) as Array<keyof ShareScope>)
    .filter((key) => scope[key])
    .map((key) => SCOPE_LABELS[key]);
}

export interface CoachReportDeps extends CoachShareDeps {
  listMeasurements: { execute(query: { patientId: string }): MeasurementSessionDto[] };
  listPlans: { execute(query: { patientId: string }): MealPlanSummaryDto[] };
  getPlan: { execute(query: { planId: string }): MealPlanDto };
  listAdherence: { execute(query: { patientId: string }): AdherenceEntryDto[] };
  listPhotos: { execute(query: { patientId: string }): PhotoDto[] };
}

function metricsFor(
  sessions: readonly MeasurementSessionDto[],
  definitions: ReadonlyArray<{
    label: string;
    decimals: number;
    read: (s: MeasurementSessionDto) => number | null;
  }>,
): CoachReportMetricDto[] {
  return definitions
    .map(({ label, decimals, read }) => ({
      label,
      decimals,
      points: sessions
        .map((session) => ({ date: session.measuredAt, value: read(session) }))
        .filter((point): point is { date: string; value: number } => point.value !== null),
    }))
    .filter((metric) => metric.points.length > 0);
}

export class BuildCoachReportUseCase {
  constructor(private readonly deps: CoachReportDeps) {}

  /**
   * Throws AUTHORIZATION when there is no effective grant, so a caller that
   * forgets to check cannot produce a document anyway.
   */
  execute(command: ExportCoachReportCommand): CoachReportDataDto {
    const { coaches, shares, consents, patients, listMeasurements, listAdherence, listPhotos } =
      this.deps;

    const link = coaches.findLinkById(command.linkId);
    if (link === null) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Vinculación no encontrada.' });
    }
    const coach = coaches.findById(link.coachId);
    const patient = patients.findById(link.patientId);
    if (coach === null || patient === null) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Vinculación no encontrada.' });
    }
    const grant = shares.liveGrantForLink(link.id);
    if (grant === null) {
      throw new AppError({
        code: 'AUTHORIZATION',
        message: 'No hay una autorización vigente para compartir con este entrenador.',
      });
    }
    const consent = consents.findById(grant.consentId);
    const decision = evaluateCoachShare(
      grant,
      link,
      consent,
      livePhotoConsent(consents, link.patientId),
    );
    assertShareAllowed(decision);

    const scope = decision.scope;
    const sessions = listMeasurements
      .execute({ patientId: patient.id })
      .slice()
      .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));

    const metrics = [
      ...(scope.measurements ? metricsFor(sessions, MEASUREMENT_METRICS) : []),
      ...(scope.bodyComposition ? metricsFor(sessions, BODY_COMPOSITION_METRICS) : []),
    ];

    return {
      patientId: patient.id,
      patientName: `${patient.firstName} ${patient.lastName}`,
      patientFileNumber: patient.fileNumber,
      coachName: coach.displayName,
      // consent is non-null: assertShareAllowed would have refused otherwise.
      consentNoticeVersion: consent?.noticeVersion ?? '',
      consentDecidedAt: consent?.decidedAt.slice(0, 10) ?? '',
      scope,
      scopeLabels: shareScopeLabels(scope),
      metrics,
      planTargets: scope.planTargets ? this.activePlanTargets(patient.id) : null,
      adherence: scope.adherence
        ? listAdherence
            .execute({ patientId: patient.id })
            .map((entry) => ({ recordedAt: entry.recordedAt, score: entry.score }))
            .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
        : [],
      photos: scope.photos
        ? listPhotos
            .execute({ patientId: patient.id })
            .map((photo) => ({ id: photo.id, kind: photo.kind, capturedAt: photo.capturedAt }))
        : [],
      sessionCount: scope.measurements || scope.bodyComposition ? sessions.length : 0,
    };
  }

  /** Energy and protein only. The plan itself is her work product. */
  private activePlanTargets(patientId: string): { energyKcal: number; proteinG: number } | null {
    const active = this.deps.listPlans
      .execute({ patientId })
      .find((plan) => plan.status === 'active');
    if (active === undefined) return null;
    const plan = this.deps.getPlan.execute({ planId: active.id });
    return { energyKcal: plan.targets.energyKcal, proteinG: plan.targets.proteinG };
  }
}

/**
 * Every trainee of one coach who may lawfully be reported on, plus everyone
 * who may not and the reason. The skip list is not an afterthought: a batch
 * that quietly left someone out reads as "everyone was included", which is how
 * a practitioner ends up believing she sent a trainer more than she did — or
 * less.
 */
export class BuildCoachPackUseCase {
  constructor(private readonly deps: CoachReportDeps) {}

  execute(command: ExportCoachPackCommand): {
    coachName: string;
    reports: CoachReportDataDto[];
    skipped: CoachPackSkipDto[];
  } {
    const { coaches, shares, consents, patients } = this.deps;
    const coach = coaches.findById(command.coachId);
    if (coach === null) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Entrenador no encontrado.' });
    }

    const reports: CoachReportDataDto[] = [];
    const skipped: CoachPackSkipDto[] = [];
    const builder = new BuildCoachReportUseCase(this.deps);

    // Every live referral, archived patients included — they are skipped WITH A
    // REASON below rather than filtered out upstream, where they would vanish
    // from both the reports and the skip list and the batch would look complete.
    for (const link of coaches.listLiveLinksForCoach(coach.id)) {
      const patient = patients.findById(link.patientId);
      if (patient === null) continue;
      const patientName = `${patient.firstName} ${patient.lastName}`;
      if (patient.status === 'archived') {
        // Not an authorisation failure: the grant may well be live, and she can
        // still produce this one report by hand from the patient's own page.
        skipped.push({ patientName, reason: 'patient_archived' });
        continue;
      }
      const grant = shares.liveGrantForLink(link.id);
      if (grant === null) {
        skipped.push({ patientName, reason: 'no_authorisation' });
        continue;
      }
      const decision = evaluateCoachShare(
        grant,
        link,
        consents.findById(grant.consentId),
        livePhotoConsent(consents, link.patientId),
      );
      if (!decision.effective) {
        skipped.push({ patientName, reason: decision.reason ?? 'no_authorisation' });
        continue;
      }
      reports.push(builder.execute({ linkId: link.id }));
    }

    return { coachName: coach.displayName, reports, skipped };
  }
}
