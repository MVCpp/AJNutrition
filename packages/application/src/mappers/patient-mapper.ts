import type { Patient } from '@ajnutrition/domain';
import type { PatientDto } from '@ajnutrition/shared';

export function toPatientDto(patient: Patient): PatientDto {
  return {
    id: patient.id,
    fileNumber: patient.fileNumber,
    firstName: patient.firstName,
    lastName: patient.lastName,
    dateOfBirth: patient.dateOfBirth,
    sexAtBirth: patient.sexAtBirth,
    email: patient.email,
    phone: patient.phone,
    status: patient.status,
    createdAt: patient.createdAt,
    updatedAt: patient.updatedAt,
  };
}
