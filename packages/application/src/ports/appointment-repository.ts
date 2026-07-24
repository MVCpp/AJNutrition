import type { Appointment } from '@ajnutrition/domain';

export interface AppointmentWithPatient {
  appointment: Appointment;
  patientName: string;
}

export interface AppointmentRepository {
  insert(appointment: Appointment): void;
  update(appointment: Appointment): void;
  findById(id: string): Appointment | null;
  /** Inclusive civil-date range, ordered by scheduledAt asc, patient name joined. */
  listBetween(fromDate: string, toDate: string): AppointmentWithPatient[];
}
