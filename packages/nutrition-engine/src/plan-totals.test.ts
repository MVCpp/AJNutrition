import { describe, expect, it } from 'vitest';
import { macroTargetsFromEnergy, scaleNutrients, scaleTotals, sumTotals } from './plan-totals';
import { teeFromPal } from './registry';

const tortillaNutrients = {
  energy_kcal: 218,
  protein_g: 5.7,
  carbohydrate_g: 44.6,
  fat_g: 2.9,
  fiber_g: 6.3,
};

describe('scaleNutrients', () => {
  it('scales by grams over basis and marks absent nutrients incomplete', () => {
    const scaled = scaleNutrients(tortillaNutrients, 100, 50);
    expect(scaled.find((t) => t.nutrientId === 'energy_kcal')).toMatchObject({
      amount: 109,
      complete: true,
    });
    expect(scaled.find((t) => t.nutrientId === 'sodium_mg')).toMatchObject({
      amount: 0,
      complete: false,
    });
  });
});

describe('sumTotals', () => {
  it('sums entries and ANDs completeness', () => {
    const a = scaleNutrients(tortillaNutrients, 100, 100);
    const b = scaleNutrients({ energy_kcal: 100, protein_g: 10 }, 100, 100);
    const sum = sumTotals([a, b]);
    expect(sum.find((t) => t.nutrientId === 'energy_kcal')).toMatchObject({
      amount: 318,
      complete: true,
    });
    // b lacks carbohydrate data → day is incomplete for carbs.
    expect(sum.find((t) => t.nutrientId === 'carbohydrate_g')?.complete).toBe(false);
  });

  it('an empty meal is complete with zero amounts', () => {
    const sum = sumTotals([]);
    expect(sum.every((t) => t.amount === 0 && t.complete)).toBe(true);
  });
});

describe('TEE from PAL (FAO/WHO/UNU 2001)', () => {
  it('multiplies deterministically and warns outside reference PAL range', () => {
    expect(teeFromPal(1650, 1.55).roundedResult).toBe(2558);
    expect(teeFromPal(1650, 1.55).warnings).toHaveLength(0);
    expect(teeFromPal(1650, 1.1).warnings).toContain('pal_out_of_reference_range');
  });
});

describe('macroTargetsFromEnergy (Atwater)', () => {
  it('splits an energy target into gram targets', () => {
    // 2000 kcal at 20/50/30 → P 100 g, C 250 g, F 67 g
    expect(macroTargetsFromEnergy(2000, 20, 50, 30)).toEqual({
      proteinG: 100,
      carbohydrateG: 250,
      fatG: 67,
    });
  });
});

describe('scaleTotals', () => {
  it('scales recipe per-portion totals by portion count', () => {
    const base = scaleNutrients(tortillaNutrients, 100, 100);
    const doubled = scaleTotals(base, 2);
    expect(doubled.find((t) => t.nutrientId === 'energy_kcal')?.amount).toBe(436);
  });
});
