import { NUTRIENTS } from './nutrients';
import { roundTo } from './units';

/**
 * Deterministic recipe nutrient totals (§17).
 *
 * The MISSING ≠ ZERO rule (§14.4): if any ingredient lacks a value for a
 * nutrient, that nutrient's total is flagged incomplete — the partial sum is
 * shown as a floor, never presented as the true total. Only nutrients where
 * EVERY ingredient has data are complete.
 */

export interface RecipeIngredientInput {
  grams: number;
  /** nutrientId → amount per basisGrams. */
  nutrients: Record<string, number>;
  basisGrams: number;
}

export interface NutrientTotal {
  nutrientId: string;
  amount: number;
  /** False when at least one ingredient had no data for this nutrient. */
  complete: boolean;
}

export function computeRecipeTotals(ingredients: RecipeIngredientInput[]): NutrientTotal[] {
  return Object.keys(NUTRIENTS).map((nutrientId) => {
    let amount = 0;
    let complete = true;
    for (const ingredient of ingredients) {
      const perBasis = ingredient.nutrients[nutrientId];
      if (perBasis === undefined) {
        complete = false;
        continue;
      }
      amount += (perBasis * ingredient.grams) / ingredient.basisGrams;
    }
    return { nutrientId, amount: roundTo(amount, 1), complete };
  });
}

export function perPortion(totals: NutrientTotal[], yieldPortions: number): NutrientTotal[] {
  return totals.map((total) => ({
    ...total,
    amount: roundTo(total.amount / yieldPortions, 1),
  }));
}
