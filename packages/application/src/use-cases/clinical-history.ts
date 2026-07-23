import {
  assertCanSupersede,
  createHistoryEntry,
  type ClinicalHistoryEntry,
  type DomainContext,
} from '@ajnutrition/domain';
import {
  AppError,
  type AddHistoryEntryCommand,
  type HistoryEntryDto,
  type ListHistoryQuery,
} from '@ajnutrition/shared';
import type { AuditLog } from '../ports/audit-log';
import type { ClinicalHistoryRepository } from '../ports/clinical-history-repository';
import type { PatientRepository } from '../ports/patient-repository';
import type { UnitOfWork } from '../ports/unit-of-work';

export interface ClinicalHistoryDeps {
  uow: UnitOfWork;
  history: ClinicalHistoryRepository;
  patients: PatientRepository;
  audit: AuditLog;
  ctx: DomainContext;
}

function toDto(entry: ClinicalHistoryEntry): HistoryEntryDto {
  return {
    id: entry.id,
    patientId: entry.patientId,
    category: entry.category,
    content: entry.content,
    createdAt: entry.createdAt,
    supersededAt: entry.supersededAt,
    supersededById: entry.supersededById,
  };
}

export class AddHistoryEntryUseCase {
  constructor(private readonly deps: ClinicalHistoryDeps) {}

  execute(command: AddHistoryEntryCommand): HistoryEntryDto {
    const { uow, history, patients, audit, ctx } = this.deps;
    return uow.run(() => {
      if (patients.findById(command.patientId) === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Paciente no encontrado.' });
      }
      if (command.supersedesId !== undefined) {
        const predecessor = history.findById(command.supersedesId);
        if (predecessor === null) {
          throw new AppError({ code: 'NOT_FOUND', message: 'Antecedente no encontrado.' });
        }
        assertCanSupersede(predecessor, command.patientId, command.category);
      }

      const entry = createHistoryEntry(command, ctx);
      history.insert(entry);
      if (command.supersedesId !== undefined) {
        history.markSuperseded(command.supersedesId, entry.id, entry.createdAt);
      }
      audit.record({
        action: 'clinical-history.add',
        entityType: 'clinical-history',
        entityId: entry.id,
        result: 'success',
        // Category only — clinical CONTENT never enters the audit log.
        metadata: {
          patientId: entry.patientId,
          category: entry.category,
          superseded: command.supersedesId !== undefined,
        },
      });
      return toDto(entry);
    });
  }
}

export class ListHistoryUseCase {
  constructor(private readonly deps: Pick<ClinicalHistoryDeps, 'history'>) {}

  execute(query: ListHistoryQuery): HistoryEntryDto[] {
    return this.deps.history
      .listByPatient(query.patientId, query.includeSuperseded ?? false)
      .map(toDto);
  }
}
