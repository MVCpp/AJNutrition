import { assertMetric } from './units';
import {
  bmi,
  cunninghamRee,
  harrisBenedictRee,
  harrisBenedictRevisedRee,
  iretonJonesRee,
  katchMcArdleRee,
  mifflinStJeorRee,
  waistHeightRatio,
  waistHipRatio,
  whoFaoUnuRee,
  type CalculationResult,
} from './registry';

export interface SessionInputs {
  weightKg?: number | undefined;
  heightCm?: number | undefined;
  waistCm?: number | undefined;
  hipCm?: number | undefined;
  bodyFatPercent?: number | undefined;
  /** 'unspecified' skips sex-dependent formulas with a warning, never guesses. */
  sex: 'female' | 'male' | 'unspecified';
  ageYears: number;
}

/**
 * Runs every formula whose inputs are present in the session. Validates all
 * provided raw values first — one implausible value rejects the whole
 * session (§ Gherkin "Reject invalid height": no partial saves).
 */
export function computeSessionCalculations(inputs: SessionInputs): CalculationResult[] {
  if (inputs.weightKg !== undefined) assertMetric('weight_kg', inputs.weightKg);
  if (inputs.heightCm !== undefined) assertMetric('height_cm', inputs.heightCm);
  if (inputs.waistCm !== undefined) assertMetric('waist_cm', inputs.waistCm);
  if (inputs.hipCm !== undefined) assertMetric('hip_cm', inputs.hipCm);
  if (inputs.bodyFatPercent !== undefined) {
    assertMetric('body_fat_percent', inputs.bodyFatPercent);
  }

  const results: CalculationResult[] = [];
  if (inputs.weightKg !== undefined && inputs.heightCm !== undefined) {
    results.push(bmi(inputs.weightKg, inputs.heightCm));
  }
  if (inputs.waistCm !== undefined && inputs.heightCm !== undefined) {
    results.push(waistHeightRatio(inputs.waistCm, inputs.heightCm));
  }
  if (inputs.waistCm !== undefined && inputs.hipCm !== undefined) {
    results.push(waistHipRatio(inputs.waistCm, inputs.hipCm));
  }
  const sexKnown = inputs.sex === 'female' || inputs.sex === 'male';
  if (inputs.weightKg !== undefined && inputs.heightCm !== undefined && sexKnown) {
    const sex = inputs.sex as 'female' | 'male';
    results.push(mifflinStJeorRee(inputs.weightKg, inputs.heightCm, inputs.ageYears, sex));
    results.push(harrisBenedictRee(inputs.weightKg, inputs.heightCm, inputs.ageYears, sex));
    results.push(harrisBenedictRevisedRee(inputs.weightKg, inputs.heightCm, inputs.ageYears, sex));
    // Ireton-Jones spontaneous baseline: obesity operationalized as WHO BMI ≥ 30;
    // the ventilated/trauma/burn variant needs clinical flags outside a session.
    const sessionBmi = bmi(inputs.weightKg, inputs.heightCm).roundedResult;
    results.push(
      iretonJonesRee(inputs.ageYears, inputs.weightKg, sex, {
        ventilated: false,
        trauma: false,
        burn: false,
        obese: sessionBmi >= 30,
      }),
    );
  }
  if (inputs.weightKg !== undefined && sexKnown && inputs.ageYears >= 10) {
    results.push(whoFaoUnuRee(inputs.weightKg, inputs.ageYears, inputs.sex as 'female' | 'male'));
  }
  if (inputs.weightKg !== undefined && inputs.bodyFatPercent !== undefined) {
    results.push(katchMcArdleRee(inputs.weightKg, inputs.bodyFatPercent));
    results.push(cunninghamRee(inputs.weightKg, inputs.bodyFatPercent));
  }
  return results;
}
