import { describe, expect, it } from 'vitest';
import { bmi, FORMULAS, mifflinStJeorRee, waistHeightRatio, waistHipRatio } from './registry';
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
      'mifflin_st_jeor_ree',
      'waist_height_ratio',
      'waist_hip_ratio',
    ]);

    const weightOnly = computeSessionCalculations({ ...base, weightKg: 80 });
    expect(weightOnly).toHaveLength(0);
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
