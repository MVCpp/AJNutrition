import type { ListPatientsQuery, PatientDto } from '@ajnutrition/shared';
import type { PatientRepository } from '../ports/patient-repository';
import { toPatientDto } from '../mappers/patient-mapper';

export class ListPatientsUseCase {
  constructor(private readonly patients: PatientRepository) {}

  execute(query: ListPatientsQuery): PatientDto[] {
    return this.patients
      .search({ search: query.search, includeArchived: query.includeArchived ?? false })
      .map(toPatientDto);
  }
}
