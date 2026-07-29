import { ageInYears, parseIsoDate, type DomainContext } from '@ajnutrition/domain';
import { computeSessionCalculations, FORMULAS } from '@ajnutrition/nutrition-engine';
import type { FormulaDriftDto } from '@ajnutrition/shared';
import type { MeasurementRepository } from '../ports/measurement-repository';
import type { PatientRepository } from '../ports/patient-repository';

export interface FormulaDriftDeps {
  measurements: MeasurementRepository;
  patients: PatientRepository;
  ctx: DomainContext;
}

/**
 * Finds stored results that today's engine would compute differently (§13.4).
 *
 * Historical results are frozen with the formula id and version that produced
 * them and are NEVER rewritten — that is the whole point of the provenance.
 * But when a formula ships a corrected version, the practitioner needs to know
 * which of her patients' numbers would change, so she can decide, per patient,
 * whether to re-measure or re-run. This report is that decision aid and
 * nothing more: it writes nothing.
 */
export class ListFormulaDriftUseCase {
  constructor(private readonly deps: FormulaDriftDeps) {}

  execute(): FormulaDriftDto[] {
    const { measurements, patients } = this.deps;
    const drift: FormulaDriftDto[] = [];

    for (const patient of patients.search({ includeArchived: true })) {
      const birthDate = parseIsoDate(patient.dateOfBirth);
      if (birthDate === null) continue;

      for (const session of measurements.listByPatient(patient.id)) {
        const measuredAt = parseIsoDate(session.measuredAt);
        if (measuredAt === null) continue;
        const values = session.values;

        // Recompute from the SAME stored raw values with today's engine.
        const recomputed = computeSessionCalculations({
          weightKg: values.weight_kg,
          heightCm: values.height_cm,
          waistCm: values.waist_cm,
          hipCm: values.hip_cm,
          bodyFatPercent: values.body_fat_percent,
          skinfoldBicepsMm: values.skinfold_biceps_mm,
          skinfoldTricepsMm: values.skinfold_triceps_mm,
          skinfoldSubscapularMm: values.skinfold_subscapular_mm,
          skinfoldSuprailiacMm: values.skinfold_suprailiac_mm,
          skinfoldChestMm: values.skinfold_chest_mm,
          skinfoldAbdomenMm: values.skinfold_abdomen_mm,
          skinfoldThighMm: values.skinfold_thigh_mm,
          sex: patient.sexAtBirth,
          ageYears: ageInYears(birthDate, measuredAt),
        });

        for (const stored of session.calculated) {
          const current = recomputed.find((entry) => entry.formulaId === stored.formulaId);
          if (current === undefined) continue;
          const changed =
            current.formulaVersion !== stored.formulaVersion ||
            current.roundedResult !== stored.roundedResult;
          if (!changed) continue;
          drift.push({
            patientId: patient.id,
            patientFileNumber: patient.fileNumber,
            sessionId: session.id,
            measuredAt: session.measuredAt,
            formulaId: stored.formulaId,
            formulaName: FORMULAS[stored.formulaId]?.name ?? stored.formulaId,
            storedVersion: stored.formulaVersion,
            storedResult: stored.roundedResult,
            currentVersion: current.formulaVersion,
            currentResult: current.roundedResult,
            unit: current.unit,
          });
        }
      }
    }
    return drift;
  }
}
