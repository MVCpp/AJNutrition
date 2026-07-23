import { describe, expect, it } from 'vitest';
import {
  bmi,
  cunninghamRee,
  FORMULAS,
  harrisBenedictRee,
  harrisBenedictRevisedRee,
  iretonJonesRee,
  katchMcArdleRee,
  mifflinStJeorRee,
  waistHeightRatio,
  waistHipRatio,
  whoFaoUnuRee,
} from './registry';
import { computeSessionCalculations } from './session-calculations';
import { roundTo } from './units';

describe('formula registry hygiene (§13.1)', () => {
  it('every formula declares citation, version, population, inputs, and rounding policy', () => {
    const entries = Object.values(FORMULAS);
    expect(entries.length).toBeGreaterThanOrEqual(4);
    for (const meta of entries) {
      expect(meta.citation.length, meta.id).toBeGreaterThan(30);
      expect(meta.version, meta.id).toBeGreaterThanOrEqual(1);
      expect(meta.population.length, meta.id).toBeGreaterThan(5);
      expect(meta.inputs.length, meta.id).toBeGreaterThan(0);
      expect(meta.roundingPolicy.length, meta.id).toBeGreaterThan(3);
    }
  });
});

describe('BMI (WHO)', () => {
  it('computes the textbook value with provenance', () => {
    const result = bmi(70, 175);
    expect(result.roundedResult).toBe(22.9);
    expect(result.rawResult).toBeCloseTo(22.8571, 3);
    expect(result).toMatchObject({
      formulaId: 'bmi',
      formulaVersion: 1,
      inputs: { weightKg: 70, heightCm: 175 },
      unit: 'kg/m²',
    });
  });

  it('is deterministic', () => {
    expect(bmi(82.4, 168.5)).toEqual(bmi(82.4, 168.5));
  });
});

describe('Mifflin-St Jeor REE (1990)', () => {
  it('matches hand-computed values for both sexes', () => {
    // 10·70 + 6.25·175 − 5·30 = 1643.75
    expect(mifflinStJeorRee(70, 175, 30, 'male').roundedResult).toBe(1649);
    expect(mifflinStJeorRee(70, 175, 30, 'female').roundedResult).toBe(1483);
  });

  it('warns (never blocks) outside the study population of 19-78 years', () => {
    expect(mifflinStJeorRee(70, 175, 18, 'male').warnings).toContain('population_out_of_range');
    expect(mifflinStJeorRee(70, 175, 79, 'female').warnings).toContain('population_out_of_range');
    expect(mifflinStJeorRee(70, 175, 19, 'male').warnings).toHaveLength(0);
    expect(mifflinStJeorRee(70, 175, 78, 'male').warnings).toHaveLength(0);
  });
});

describe('waist ratios (WHO 2008)', () => {
  it('computes both ratios to 2 decimals', () => {
    expect(waistHeightRatio(80, 175).roundedResult).toBe(0.46);
    expect(waistHipRatio(80, 100).roundedResult).toBe(0.8);
  });
});

describe('computeSessionCalculations', () => {
  const base = { sex: 'male' as const, ageYears: 35 };

  it('runs exactly the formulas whose inputs are present', () => {
    const all = computeSessionCalculations({
      ...base,
      weightKg: 80,
      heightCm: 180,
      waistCm: 90,
      hipCm: 100,
    });
    expect(all.map((r) => r.formulaId).sort()).toEqual([
      'bmi',
      'harris_benedict_ree',
      'harris_benedict_revised_ree',
      'ireton_jones_ree',
      'mifflin_st_jeor_ree',
      'waist_height_ratio',
      'waist_hip_ratio',
      'who_fao_unu_ree',
    ]);

    // Weight alone: only the weight-based OMS/FAO/UNU equation applies.
    const weightOnly = computeSessionCalculations({ ...base, weightKg: 80 });
    expect(weightOnly.map((r) => r.formulaId)).toEqual(['who_fao_unu_ree']);
  });

  it('skips sex-dependent formulas for unspecified sex instead of guessing', () => {
    const results = computeSessionCalculations({
      sex: 'unspecified',
      ageYears: 35,
      weightKg: 80,
      heightCm: 180,
    });
    expect(results.map((r) => r.formulaId)).toEqual(['bmi']);
  });

  it('rejects the entire session on one implausible value (no partial saves)', () => {
    expect(() =>
      computeSessionCalculations({ ...base, weightKg: 80, heightCm: 20 }),
    ).toThrowError();
    expect(() => computeSessionCalculations({ ...base, weightKg: 500 })).toThrowError();
  });
});

describe('roundTo', () => {
  it('rounds half-up deterministically', () => {
    expect(roundTo(22.85, 1)).toBe(22.9);
    expect(roundTo(1648.75, 0)).toBe(1649);
    expect(roundTo(0.457, 2)).toBe(0.46);
  });
});

describe('alternative REE formulas', () => {
  // Reference subject: male, 80 kg, 180 cm, 35 years, 20% body fat.
  it('Harris-Benedict original matches hand computation', () => {
    // 66.473 + 13.7516·80 + 5.0033·180 − 6.755·35 = 66.473+1100.128+900.594−236.425
    const r = harrisBenedictRee(80, 180, 35, 'male');
    expect(r.roundedResult).toBe(1831);
    const f = harrisBenedictRee(60, 165, 30, 'female');
    // 655.0955 + 9.5634·60 + 1.8496·165 − 4.6756·30 = 655.0955+573.804+305.184−140.268
    expect(f.roundedResult).toBe(1394);
  });

  it('Harris-Benedict revised (Roza-Shizgal 1984) matches hand computation', () => {
    // 88.362 + 13.397·80 + 4.799·180 − 5.677·35 = 88.362+1071.76+863.82−198.695
    expect(harrisBenedictRevisedRee(80, 180, 35, 'male').roundedResult).toBe(1825);
    // 447.593 + 9.247·60 + 3.098·165 − 4.33·30 = 447.593+554.82+511.17−129.9
    expect(harrisBenedictRevisedRee(60, 165, 30, 'female').roundedResult).toBe(1384);
  });

  it('Katch-McArdle and Cunningham use fat-free mass', () => {
    // FFM = 80·0.8 = 64 kg → KM: 370 + 21.6·64 = 1752.4; Cunningham: 500 + 22·64 = 1908
    const km = katchMcArdleRee(80, 20);
    expect(km.roundedResult).toBe(1752);
    expect(km.inputs['fatFreeMassKg']).toBe(64);
    expect(cunninghamRee(80, 20).roundedResult).toBe(1908);
  });

  it('WHO/FAO/UNU picks the correct age band', () => {
    // 35 y male: 11.6·80 + 879 = 1807; 25 y female 60 kg: 14.7·60 + 496 = 1378
    expect(whoFaoUnuRee(80, 35, 'male').roundedResult).toBe(1807);
    expect(whoFaoUnuRee(60, 25, 'female').roundedResult).toBe(1378);
    // 65 y male 70 kg: 13.5·70 + 487 = 1432; minor gets a population warning
    expect(whoFaoUnuRee(70, 65, 'male').roundedResult).toBe(1432);
    expect(whoFaoUnuRee(50, 15, 'female').warnings).toContain('population_out_of_range');
  });

  it('Ireton-Jones distinguishes spontaneous and ventilated variants', () => {
    // Spontaneous, 35 y, 80 kg, non-obese: 629 − 385 + 2000 − 0 = 2244
    const spontaneous = iretonJonesRee(35, 80, 'male', {
      ventilated: false,
      trauma: false,
      burn: false,
      obese: false,
    });
    expect(spontaneous.roundedResult).toBe(2244);
    expect(spontaneous.warnings).toContain('clinical_population_formula');
    // Obese subtracts 609
    expect(
      iretonJonesRee(35, 80, 'male', {
        ventilated: false,
        trauma: false,
        burn: false,
        obese: true,
      }).roundedResult,
    ).toBe(1635);
    // Ventilated male with trauma and burn: 1784 − 385 + 400 + 244 + 239 + 804 = 3086
    expect(
      iretonJonesRee(35, 80, 'male', {
        ventilated: true,
        trauma: true,
        burn: true,
        obese: false,
      }).roundedResult,
    ).toBe(3086);
  });

  it('session calculations include every applicable REE formula', () => {
    const results = computeSessionCalculations({
      weightKg: 80,
      heightCm: 180,
      bodyFatPercent: 20,
      sex: 'male',
      ageYears: 35,
    });
    const ids = results.map((r) => r.formulaId);
    expect(ids).toContain('mifflin_st_jeor_ree');
    expect(ids).toContain('harris_benedict_ree');
    expect(ids).toContain('harris_benedict_revised_ree');
    expect(ids).toContain('who_fao_unu_ree');
    expect(ids).toContain('ireton_jones_ree');
    expect(ids).toContain('katch_mcardle_ree');
    expect(ids).toContain('cunningham_ree');
    // Without body fat, lean-mass formulas are honestly absent.
    const noBf = computeSessionCalculations({
      weightKg: 80,
      heightCm: 180,
      sex: 'male',
      ageYears: 35,
    }).map((r) => r.formulaId);
    expect(noBf).not.toContain('katch_mcardle_ree');
    expect(noBf).not.toContain('cunningham_ree');
  });
});
