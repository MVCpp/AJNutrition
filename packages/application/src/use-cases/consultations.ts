import {
  createAmendment,
  createConsultation,
  signConsultation,
  type Consultation,
  type DomainContext,
} from '@ajnutrition/domain';
import {
  AppError,
  type AmendConsultationCommand,
  type ConsultationDto,
  type CreateConsultationCommand,
  type ListConsultationsQuery,
  type SignConsultationCommand,
} from '@ajnutrition/shared';
import type { AuditLog } from '../ports/audit-log';
import type { ConsultationRepository } from '../ports/consultation-repository';
import type { PatientRepository } from '../ports/patient-repository';
import type { UnitOfWork } from '../ports/unit-of-work';

export interface ConsultationDeps {
  uow: UnitOfWork;
  consultations: ConsultationRepository;
  patients: PatientRepository;
  audit: AuditLog;
  ctx: DomainContext;
}

function toDto(consultation: Consultation, repo: ConsultationRepository): ConsultationDto {
  return {
    id: consultation.id,
    patientId: consultation.patientId,
    consultationDate: consultation.consultationDate,
    consultationType: consultation.consultationType,
    subjective: consultation.subjective,
    objective: consultation.objective,
    assessment: consultation.assessment,
    plan: consultation.plan,
    status: consultation.status,
    signedAt: consultation.signedAt,
    createdAt: consultation.createdAt,
    updatedAt: consultation.updatedAt,
    amendments: repo.listAmendments(consultation.id).map((a) => ({
      id: a.id,
      reason: a.reason,
      content: a.content,
      createdAt: a.createdAt,
    })),
  };
}

function requireConsultation(repo: ConsultationRepository, id: string): Consultation {
  const consultation = repo.findById(id);
  if (consultation === null) {
    throw new AppError({ code: 'NOT_FOUND', message: 'Consulta no encontrada.' });
  }
  return consultation;
}

export class CreateConsultationUseCase {
  constructor(private readonly deps: ConsultationDeps) {}

  execute(command: CreateConsultationCommand): ConsultationDto {
    const { uow, consultations, patients, audit, ctx } = this.deps;
    return uow.run(() => {
      if (patients.findById(command.patientId) === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Paciente no encontrado.' });
      }
      const consultation = createConsultation(command, ctx);
      consultations.insert(consultation);
      audit.record({
        action: 'consultation.create',
        entityType: 'consultation',
        entityId: consultation.id,
        result: 'success',
        metadata: { patientId: consultation.patientId, type: consultation.consultationType },
      });
      return toDto(consultation, consultations);
    });
  }
}

export class ListConsultationsUseCase {
  constructor(private readonly deps: Pick<ConsultationDeps, 'consultations'>) {}

  execute(query: ListConsultationsQuery): ConsultationDto[] {
    const { consultations } = this.deps;
    return consultations.listByPatient(query.patientId).map((c) => toDto(c, consultations));
  }
}

export class SignConsultationUseCase {
  constructor(private readonly deps: ConsultationDeps) {}

  execute(command: SignConsultationCommand): ConsultationDto {
    const { uow, consultations, audit, ctx } = this.deps;
    return uow.run(() => {
      const signed = signConsultation(
        requireConsultation(consultations, command.consultationId),
        ctx,
      );
      consultations.update(signed);
      audit.record({
        action: 'consultation.sign',
        entityType: 'consultation',
        entityId: signed.id,
        result: 'success',
      });
      return toDto(signed, consultations);
    });
  }
}

export class AmendConsultationUseCase {
  constructor(private readonly deps: ConsultationDeps) {}

  execute(command: AmendConsultationCommand): ConsultationDto {
    const { uow, consultations, audit, ctx } = this.deps;
    return uow.run(() => {
      const consultation = requireConsultation(consultations, command.consultationId);
      const amendment = createAmendment(
        consultation,
        { reason: command.reason, content: command.content },
        ctx,
      );
      consultations.insertAmendment(amendment);
      audit.record({
        action: 'consultation.amend',
        entityType: 'consultation',
        entityId: consultation.id,
        result: 'success',
        // Reason categorizes the amendment; the clinical CONTENT never
        // enters the audit log.
        metadata: { amendmentId: amendment.id },
      });
      return toDto(consultation, consultations);
    });
  }
}
