import {
  activePatientCoachLink,
  createCoach,
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
import type { CoachRepository } from '../ports/coach-repository';
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
