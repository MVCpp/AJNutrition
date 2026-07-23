import { assertMetric } from './units';
import {
  bmi,
  mifflinStJeorRee,
  waistHeightRatio,
  waistHipRatio,
  type CalculationResult,
} from './registry';

export interface SessionInputs {
  weightKg?: number | undefined;
  heightCm?: number | undefined;
  waistCm?: number | undefined;
  hipCm?: number | undefined;
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
  if (inputs.weightKg !== undefined && inputs.heightCm !== undefined) {
    if (inputs.sex === 'female' || inputs.sex === 'male') {
      results.push(mifflinStJeorRee(inputs.weightKg, inputs.heightCm, inputs.ageYears, inputs.sex));
    }
  }
  return results;
}
