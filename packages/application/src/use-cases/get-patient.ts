import { AppError, type GetPatientQuery, type PatientDto } from '@ajnutrition/shared';
import type { PatientRepository } from '../ports/patient-repository';
import { toPatientDto } from '../mappers/patient-mapper';

export class GetPatientUseCase {
  constructor(private readonly patients: PatientRepository) {}

  execute(query: GetPatientQuery): PatientDto {
    const patient = this.patients.findById(query.patientId);
    if (patient === null) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Paciente no encontrado.' });
    }
    return toPatientDto(patient);
  }
}
