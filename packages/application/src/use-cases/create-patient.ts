import { createPatient, type DomainContext } from '@ajnutrition/domain';
import { AppError, type CreatePatientCommand, type PatientDto } from '@ajnutrition/shared';
import type { AuditLog } from '../ports/audit-log';
import type { PatientRepository } from '../ports/patient-repository';
import type { UnitOfWork } from '../ports/unit-of-work';
import { toPatientDto } from '../mappers/patient-mapper';

export interface CreatePatientDeps {
  uow: UnitOfWork;
  patients: PatientRepository;
  audit: AuditLog;
  ctx: DomainContext;
}

/**
 * Creates a patient inside a single transaction: duplicate guard, file-number
 * assignment, insert, and success audit event commit or roll back together.
 */
export class CreatePatientUseCase {
  constructor(private readonly deps: CreatePatientDeps) {}

  execute(command: CreatePatientCommand): PatientDto {
    const { uow, patients, audit, ctx } = this.deps;
    return uow.run(() => {
      if (patients.existsDuplicate(command.firstName, command.lastName, command.dateOfBirth)) {
        throw new AppError({
          code: 'CONFLICT',
          message: 'Ya existe un paciente con el mismo nombre y fecha de nacimiento.',
        });
      }
      const patient = createPatient(
        {
          fileNumber: patients.nextFileNumber(),
          firstName: command.firstName,
          lastName: command.lastName,
          dateOfBirth: command.dateOfBirth,
          sexAtBirth: command.sexAtBirth,
          email: command.email,
          phone: command.phone,
        },
        ctx,
      );
      patients.insert(patient);
      audit.record({
        action: 'patient.create',
        entityType: 'patient',
        entityId: patient.id,
        result: 'success',
        metadata: { fileNumber: patient.fileNumber },
      });
      return toPatientDto(patient);
    });
  }
}
