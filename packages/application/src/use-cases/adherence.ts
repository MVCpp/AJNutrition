import { parseIsoDate, type DomainContext } from '@ajnutrition/domain';
import {
  AppError,
  type AdherenceEntryDto,
  type ListAdherenceQuery,
  type RecordAdherenceCommand,
} from '@ajnutrition/shared';
import type { AdherenceRepository } from '../ports/adherence-repository';
import type { AuditLog } from '../ports/audit-log';
import type { ConsultationRepository } from '../ports/consultation-repository';
import type { PatientRepository } from '../ports/patient-repository';
import type { UnitOfWork } from '../ports/unit-of-work';

export interface AdherenceDeps {
  uow: UnitOfWork;
  adherence: AdherenceRepository;
  patients: PatientRepository;
  consultations: ConsultationRepository;
  audit: AuditLog;
  ctx: DomainContext;
}

export class RecordAdherenceUseCase {
  constructor(private readonly deps: AdherenceDeps) {}

  execute(command: RecordAdherenceCommand): AdherenceEntryDto {
    const { uow, adherence, patients, consultations, audit, ctx } = this.deps;
    return uow.run(() => {
      if (patients.findById(command.patientId) === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Paciente no encontrado.' });
      }
      const recordedAt = parseIsoDate(command.recordedAt);
      if (recordedAt === null || recordedAt.getTime() > ctx.now().getTime()) {
        throw new AppError({
          code: 'VALIDATION',
          message: 'La fecha de registro no es válida.',
          fieldErrors: { recordedAt: ['invalid_date'] },
        });
      }
      if (command.consultationId !== undefined) {
        const consultation = consultations.findById(command.consultationId);
        if (consultation === null || consultation.patientId !== command.patientId) {
          throw new AppError({
            code: 'VALIDATION',
            message: 'La consulta indicada no existe o pertenece a otro paciente.',
          });
        }
      }
      const record = {
        id: ctx.newId(),
        patientId: command.patientId,
        consultationId: command.consultationId ?? null,
        recordedAt: command.recordedAt,
        score: command.score,
        notes: command.notes?.trim() || null,
        createdAt: ctx.now().toISOString(),
      };
      adherence.insert(record);
      audit.record({
        action: 'adherence.record',
        entityType: 'adherence',
        entityId: record.id,
        result: 'success',
        // The score is operational (not clinical narrative); notes never audit.
        metadata: { patientId: record.patientId, score: record.score },
      });
      return record;
    });
  }
}

export class ListAdherenceUseCase {
  constructor(private readonly deps: Pick<AdherenceDeps, 'adherence'>) {}

  execute(query: ListAdherenceQuery): AdherenceEntryDto[] {
    return this.deps.adherence.listByPatient(query.patientId);
  }
}
