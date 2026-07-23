import {
  createConsentRecord,
  withdrawConsent,
  type ConsentRecord,
  type DomainContext,
} from '@ajnutrition/domain';
import {
  AppError,
  type ConsentDto,
  type ListConsentsQuery,
  type RecordConsentCommand,
  type WithdrawConsentCommand,
} from '@ajnutrition/shared';
import type { AuditLog } from '../ports/audit-log';
import type { ConsentRepository } from '../ports/consent-repository';
import type { PatientRepository } from '../ports/patient-repository';
import type { UnitOfWork } from '../ports/unit-of-work';

export interface ConsentDeps {
  uow: UnitOfWork;
  consents: ConsentRepository;
  patients: PatientRepository;
  audit: AuditLog;
  ctx: DomainContext;
}

function toDto(record: ConsentRecord): ConsentDto {
  return {
    id: record.id,
    patientId: record.patientId,
    consentType: record.consentType,
    noticeVersion: record.noticeVersion,
    status: record.status,
    method: record.method,
    decidedAt: record.decidedAt,
    withdrawnAt: record.withdrawnAt,
    notes: record.notes,
    createdAt: record.createdAt,
  };
}

export class RecordConsentUseCase {
  constructor(private readonly deps: ConsentDeps) {}

  execute(command: RecordConsentCommand): ConsentDto {
    const { uow, consents, patients, audit, ctx } = this.deps;
    return uow.run(() => {
      if (patients.findById(command.patientId) === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Paciente no encontrado.' });
      }
      const record = createConsentRecord(command, ctx);
      consents.insert(record);
      audit.record({
        action: record.status === 'accepted' ? 'consent.grant' : 'consent.decline',
        entityType: 'consent',
        entityId: record.id,
        result: 'success',
        // Type + notice version are the legally relevant facts; free-text
        // notes never enter the audit log.
        metadata: {
          patientId: record.patientId,
          consentType: record.consentType,
          noticeVersion: record.noticeVersion,
          method: record.method,
        },
      });
      return toDto(record);
    });
  }
}

export class WithdrawConsentUseCase {
  constructor(private readonly deps: ConsentDeps) {}

  execute(command: WithdrawConsentCommand): ConsentDto {
    const { uow, consents, audit, ctx } = this.deps;
    return uow.run(() => {
      const record = consents.findById(command.consentId);
      if (record === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Consentimiento no encontrado.' });
      }
      const withdrawn = withdrawConsent(record, ctx);
      consents.applyWithdrawal(withdrawn);
      audit.record({
        action: 'consent.withdraw',
        entityType: 'consent',
        entityId: withdrawn.id,
        result: 'success',
        metadata: {
          patientId: withdrawn.patientId,
          consentType: withdrawn.consentType,
          noticeVersion: withdrawn.noticeVersion,
        },
      });
      return toDto(withdrawn);
    });
  }
}

export class ListConsentsUseCase {
  constructor(private readonly deps: Pick<ConsentDeps, 'consents'>) {}

  execute(query: ListConsentsQuery): ConsentDto[] {
    return this.deps.consents.listByPatient(query.patientId).map(toDto);
  }
}
