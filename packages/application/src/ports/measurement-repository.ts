import type { CalculationResult } from '@ajnutrition/nutrition-engine';

export interface MeasurementSessionRecord {
  id: string;
  patientId: string;
  measuredAt: string;
  values: Partial<
    Record<
      | 'weight_kg'
      | 'height_cm'
      | 'waist_cm'
      | 'hip_cm'
      | 'body_fat_percent'
      | 'skinfold_biceps_mm'
      | 'skinfold_triceps_mm'
      | 'skinfold_subscapular_mm'
      | 'skinfold_suprailiac_mm'
      | 'skinfold_chest_mm'
      | 'skinfold_abdomen_mm'
      | 'skinfold_thigh_mm'
      | 'skeletal_muscle_mass_kg'
      | 'fat_mass_kg'
      | 'fat_free_mass_kg'
      | 'total_body_water_l'
      | 'protein_kg'
      | 'minerals_kg'
      | 'visceral_fat_level'
      | 'device_bmr_kcal'
      | 'smi_kg_m2'
      | 'bia_score',
      number
    >
  >;
  calculated: Array<CalculationResult & { id: string }>;
  consultationId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface MeasurementRepository {
  insertSession(session: MeasurementSessionRecord): void;
  findById(sessionId: string): MeasurementSessionRecord | null;
  listByPatient(patientId: string): MeasurementSessionRecord[];
}
