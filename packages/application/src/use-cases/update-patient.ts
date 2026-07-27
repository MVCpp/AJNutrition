import {
  setPatientStatus,
  updatePatientDetails,
  type DomainContext,
  type Patient,
} from '@ajnutrition/domain';
import {
  AppError,
  type PatientDto,
  type SetPatientStatusCommand,
  type UpdatePatientCommand,
} from '@ajnutrition/shared';
import type { AuditLog } from '../ports/audit-log';
import type { PatientRepository } from '../ports/patient-repository';
import type { UnitOfWork } from '../ports/unit-of-work';
import { toPatientDto } from '../mappers/patient-mapper';

export interface UpdatePatientDeps {
  uow: UnitOfWork;
  patients: PatientRepository;
  audit: AuditLog;
  ctx: DomainContext;
}

function requirePatient(patients: PatientRepository, patientId: string): Patient {
  const patient = patients.findById(patientId);
  if (patient === null) {
    throw new AppError({ code: 'NOT_FOUND', message: 'El paciente no existe.' });
  }
  return patient;
}

/**
 * Corrects demographic data. Identity fields ARE correctable: a misspelled
 * name or a wrong birth date would otherwise be permanent, and a wrong birth
 * date silently corrupts every age-dependent calculation.
 */
export class UpdatePatientUseCase {
  constructor(private readonly deps: UpdatePatientDeps) {}

  execute(command: UpdatePatientCommand): PatientDto {
    const { uow, patients, audit, ctx } = this.deps;
    return uow.run(() => {
      const current = requirePatient(patients, command.patientId);
      // Same guard as creation, minus the patient being renamed.
      if (
        patients.existsDuplicate(
          command.firstName,
          command.lastName,
          command.dateOfBirth,
          current.id,
        )
      ) {
        throw new AppError({
          code: 'CONFLICT',
          message: 'Ya existe un paciente con el mismo nombre y fecha de nacimiento.',
        });
      }
      const updated = updatePatientDetails(current, command, ctx);
      patients.update(updated);
      // Metadata carries no names or contact data — audit rows are exportable.
      audit.record({
        action: 'patient.update',
        entityType: 'patient',
        entityId: updated.id,
        result: 'success',
        metadata: {
          fileNumber: updated.fileNumber,
          version: updated.version,
          changedDateOfBirth: current.dateOfBirth !== updated.dateOfBirth,
        },
      });
      return toPatientDto(updated);
    });
  }
}

/**
 * Archives or reactivates. Nothing is deleted: consultations, measurements
 * and documents stay untouched and come back with the patient.
 */
export class SetPatientStatusUseCase {
  constructor(private readonly deps: UpdatePatientDeps) {}

  execute(command: SetPatientStatusCommand): PatientDto {
    const { uow, patients, audit, ctx } = this.deps;
    return uow.run(() => {
      const updated = setPatientStatus(
        requirePatient(patients, command.patientId),
        command.status,
        ctx,
      );
      patients.update(updated);
      audit.record({
        action: command.status === 'archived' ? 'patient.archive' : 'patient.restore',
        entityType: 'patient',
        entityId: updated.id,
        result: 'success',
        metadata: { fileNumber: updated.fileNumber, version: updated.version },
      });
      return toPatientDto(updated);
    });
  }
}
