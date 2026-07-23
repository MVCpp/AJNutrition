import { describe, expect, it } from 'vitest';
import { computeRecipeTotals, perPortion } from './recipe-totals';

const tortilla = {
  grams: 60,
  basisGrams: 100,
  nutrients: { energy_kcal: 218, protein_g: 5.7, carbohydrate_g: 44.6, fat_g: 2.9, fiber_g: 6.3 },
};
const queso = {
  grams: 30,
  basisGrams: 100,
  // No fiber data — deliberately, to exercise missing ≠ zero.
  nutrients: { energy_kcal: 300, protein_g: 22, carbohydrate_g: 2, fat_g: 23 },
};

describe('computeRecipeTotals', () => {
  it('scales each ingredient by grams over its basis and sums', () => {
    const totals = computeRecipeTotals([tortilla, queso]);
    const energy = totals.find((t) => t.nutrientId === 'energy_kcal');
    // 218·0.6 + 300·0.3 = 130.8 + 90 = 220.8
    expect(energy).toMatchObject({ amount: 220.8, complete: true });
    const protein = totals.find((t) => t.nutrientId === 'protein_g');
    // 5.7·0.6 + 22·0.3 = 3.42 + 6.6 = 10.02 → 10
    expect(protein?.amount).toBe(10);
  });

  it('flags nutrients missing in ANY ingredient as incomplete (missing ≠ zero)', () => {
    const totals = computeRecipeTotals([tortilla, queso]);
    const fiber = totals.find((t) => t.nutrientId === 'fiber_g');
    // Partial sum from tortilla only (a floor), clearly marked incomplete.
    expect(fiber).toMatchObject({ amount: 3.8, complete: false });
    const sodium = totals.find((t) => t.nutrientId === 'sodium_mg');
    expect(sodium).toMatchObject({ amount: 0, complete: false });
  });

  it('divides per portion deterministically', () => {
    const portions = perPortion(computeRecipeTotals([tortilla, queso]), 2);
    expect(portions.find((t) => t.nutrientId === 'energy_kcal')?.amount).toBe(110.4);
  });

  it('is deterministic', () => {
    expect(computeRecipeTotals([tortilla, queso])).toEqual(computeRecipeTotals([tortilla, queso]));
  });
});
