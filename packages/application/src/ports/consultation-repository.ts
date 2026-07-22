import type { Consultation, ConsultationAmendment } from '@ajnutrition/domain';

export interface ConsultationRepository {
  insert(consultation: Consultation): void;
  findById(id: string): Consultation | null;
  listByPatient(patientId: string): Consultation[];
  /** Optimistic update: implementations must throw CONFLICT on version mismatch. */
  update(consultation: Consultation): void;
  insertAmendment(amendment: ConsultationAmendment): void;
  listAmendments(consultationId: string): ConsultationAmendment[];
}
