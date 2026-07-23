import type { CalculationResult } from '@ajnutrition/nutrition-engine';

export interface MeasurementSessionRecord {
  id: string;
  patientId: string;
  measuredAt: string;
  values: Partial<Record<'weight_kg' | 'height_cm' | 'waist_cm' | 'hip_cm', number>>;
  calculated: Array<CalculationResult & { id: string }>;
  notes: string | null;
  createdAt: string;
}

export interface MeasurementRepository {
  insertSession(session: MeasurementSessionRecord): void;
  listByPatient(patientId: string): MeasurementSessionRecord[];
}
