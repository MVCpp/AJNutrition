import { assertMetric } from './units';
import {
  bmi,
  cunninghamRee,
  durninWomersleyBodyFat,
  harrisBenedictRee,
  harrisBenedictRevisedRee,
  iretonJonesRee,
  jacksonPollock3BodyFat,
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
  skinfoldBicepsMm?: number | undefined;
  skinfoldTricepsMm?: number | undefined;
  skinfoldSubscapularMm?: number | undefined;
  skinfoldSuprailiacMm?: number | undefined;
  skinfoldChestMm?: number | undefined;
  skinfoldAbdomenMm?: number | undefined;
  skinfoldThighMm?: number | undefined;
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
  if (inputs.skinfoldBicepsMm !== undefined) {
    assertMetric('skinfold_biceps_mm', inputs.skinfoldBicepsMm);
  }
  if (inputs.skinfoldTricepsMm !== undefined) {
    assertMetric('skinfold_triceps_mm', inputs.skinfoldTricepsMm);
  }
  if (inputs.skinfoldSubscapularMm !== undefined) {
    assertMetric('skinfold_subscapular_mm', inputs.skinfoldSubscapularMm);
  }
  if (inputs.skinfoldSuprailiacMm !== undefined) {
    assertMetric('skinfold_suprailiac_mm', inputs.skinfoldSuprailiacMm);
  }
  if (inputs.skinfoldChestMm !== undefined) {
    assertMetric('skinfold_chest_mm', inputs.skinfoldChestMm);
  }
  if (inputs.skinfoldAbdomenMm !== undefined) {
    assertMetric('skinfold_abdomen_mm', inputs.skinfoldAbdomenMm);
  }
  if (inputs.skinfoldThighMm !== undefined) {
    assertMetric('skinfold_thigh_mm', inputs.skinfoldThighMm);
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

  // Skinfold-derived body fat (Durnin-Womersley 4-site; Jackson-Pollock 3-site).
  let derivedBodyFat: { percent: number; source: string } | null = null;
  if (sexKnown) {
    const sex = inputs.sex as 'female' | 'male';
    if (
      inputs.skinfoldBicepsMm !== undefined &&
      inputs.skinfoldTricepsMm !== undefined &&
      inputs.skinfoldSubscapularMm !== undefined &&
      inputs.skinfoldSuprailiacMm !== undefined
    ) {
      const dw = durninWomersleyBodyFat(
        {
          bicepsMm: inputs.skinfoldBicepsMm,
          tricepsMm: inputs.skinfoldTricepsMm,
          subscapularMm: inputs.skinfoldSubscapularMm,
          suprailiacMm: inputs.skinfoldSuprailiacMm,
        },
        inputs.ageYears,
        sex,
      );
      results.push(dw);
      derivedBodyFat = { percent: dw.roundedResult, source: dw.formulaId };
    }
    const jpSites =
      sex === 'male'
        ? inputs.skinfoldChestMm !== undefined &&
          inputs.skinfoldAbdomenMm !== undefined &&
          inputs.skinfoldThighMm !== undefined
          ? {
              sex,
              chestMm: inputs.skinfoldChestMm,
              abdomenMm: inputs.skinfoldAbdomenMm,
              thighMm: inputs.skinfoldThighMm,
            }
          : null
        : inputs.skinfoldTricepsMm !== undefined &&
            inputs.skinfoldSuprailiacMm !== undefined &&
            inputs.skinfoldThighMm !== undefined
          ? {
              sex,
              tricepsMm: inputs.skinfoldTricepsMm,
              suprailiacMm: inputs.skinfoldSuprailiacMm,
              thighMm: inputs.skinfoldThighMm,
            }
          : null;
    if (jpSites !== null) {
      const jp = jacksonPollock3BodyFat(jpSites, inputs.ageYears);
      results.push(jp);
      // Durnin-Womersley (4 sites, wider population) wins when both apply.
      derivedBodyFat ??= { percent: jp.roundedResult, source: jp.formulaId };
    }
  }

  // FFM formulas: an explicitly measured body fat always wins; a skinfold-
  // derived value fills in otherwise, flagged in the result's warnings.
  const bodyFat =
    inputs.bodyFatPercent !== undefined
      ? { percent: inputs.bodyFatPercent, source: null }
      : derivedBodyFat !== null && derivedBodyFat.percent >= 2 && derivedBodyFat.percent <= 70
        ? derivedBodyFat
        : null;
  if (inputs.weightKg !== undefined && bodyFat !== null) {
    for (const compute of [katchMcArdleRee, cunninghamRee]) {
      const result = compute(inputs.weightKg, bodyFat.percent);
      results.push(
        bodyFat.source === null
          ? result
          : { ...result, warnings: [...result.warnings, `body_fat_from_${bodyFat.source}`] },
      );
    }
  }
  return results;
}
