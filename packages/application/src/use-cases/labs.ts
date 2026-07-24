import { parseIsoDate, type DomainContext } from '@ajnutrition/domain';
import {
  AppError,
  type LabEntryDto,
  type ListLabResultsQuery,
  type RecordLabResultsCommand,
} from '@ajnutrition/shared';
import type { AuditLog } from '../ports/audit-log';
import type { ConsultationRepository } from '../ports/consultation-repository';
import type { LabRepository, LabResultRecord } from '../ports/lab-repository';
import type { PatientRepository } from '../ports/patient-repository';
import type { UnitOfWork } from '../ports/unit-of-work';

export interface LabDeps {
  uow: UnitOfWork;
  labs: LabRepository;
  patients: PatientRepository;
  consultations: ConsultationRepository;
  audit: AuditLog;
  ctx: DomainContext;
}

function toDto(record: LabResultRecord): LabEntryDto {
  const outOfRange =
    (record.referenceLow !== null && record.value < record.referenceLow) ||
    (record.referenceHigh !== null && record.value > record.referenceHigh);
  return { ...record, outOfRange };
}

export class RecordLabResultsUseCase {
  constructor(private readonly deps: LabDeps) {}

  execute(command: RecordLabResultsCommand): LabEntryDto[] {
    const { uow, labs, patients, consultations, audit, ctx } = this.deps;
    return uow.run(() => {
      if (patients.findById(command.patientId) === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Paciente no encontrado.' });
      }
      const collectedAt = parseIsoDate(command.collectedAt);
      if (collectedAt === null || collectedAt.getTime() > ctx.now().getTime()) {
        throw new AppError({
          code: 'VALIDATION',
          message: 'La fecha de toma no es válida.',
          fieldErrors: { collectedAt: ['invalid_date'] },
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
      const records: LabResultRecord[] = command.entries.map((entry) => ({
        id: ctx.newId(),
        patientId: command.patientId,
        consultationId: command.consultationId ?? null,
        collectedAt: command.collectedAt,
        analyte: entry.analyte,
        value: entry.value,
        unit: entry.unit,
        referenceLow: entry.referenceLow ?? null,
        referenceHigh: entry.referenceHigh ?? null,
        createdAt: ctx.now().toISOString(),
      }));
      labs.insertMany(records);
      audit.record({
        action: 'lab.record',
        entityType: 'lab-result',
        entityId: null,
        result: 'success',
        // Analyte names only — never the clinical values.
        metadata: {
          patientId: command.patientId,
          analytes: records.map((r) => r.analyte).join(','),
          count: records.length,
        },
      });
      return records.map(toDto);
    });
  }
}

export class ListLabResultsUseCase {
  constructor(private readonly deps: Pick<LabDeps, 'labs'>) {}

  execute(query: ListLabResultsQuery): LabEntryDto[] {
    return this.deps.labs.listByPatient(query.patientId).map(toDto);
  }
}
