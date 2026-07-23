import { NUTRIENTS } from './nutrients';
import { roundTo } from './units';
import type { NutrientTotal } from './recipe-totals';

/**
 * Meal-plan totals (§15.3). Item contributions are computed from catalog
 * data and summed per meal and per day; completeness (missing ≠ zero)
 * propagates: a day is only complete for a nutrient if every item is.
 */

export function scaleNutrients(
  nutrients: Record<string, number>,
  basisGrams: number,
  grams: number,
): NutrientTotal[] {
  return Object.keys(NUTRIENTS).map((nutrientId) => {
    const perBasis = nutrients[nutrientId];
    return perBasis === undefined
      ? { nutrientId, amount: 0, complete: false }
      : { nutrientId, amount: roundTo((perBasis * grams) / basisGrams, 1), complete: true };
  });
}

export function scaleTotals(totals: NutrientTotal[], factor: number): NutrientTotal[] {
  return totals.map((total) => ({ ...total, amount: roundTo(total.amount * factor, 1) }));
}

export function sumTotals(lists: NutrientTotal[][]): NutrientTotal[] {
  return Object.keys(NUTRIENTS).map((nutrientId) => {
    let amount = 0;
    let complete = true;
    for (const list of lists) {
      const entry = list.find((total) => total.nutrientId === nutrientId);
      if (!entry || !entry.complete) complete = false;
      if (entry) amount += entry.amount;
    }
    return {
      nutrientId,
      amount: roundTo(amount, 1),
      complete: lists.length === 0 ? true : complete,
    };
  });
}

/** Macro gram targets from an energy target via Atwater factors (4/4/9). */
export function macroTargetsFromEnergy(
  energyKcal: number,
  proteinPct: number,
  carbohydratePct: number,
  fatPct: number,
): { proteinG: number; carbohydrateG: number; fatG: number } {
  return {
    proteinG: roundTo((energyKcal * proteinPct) / 100 / 4, 0),
    carbohydrateG: roundTo((energyKcal * carbohydratePct) / 100 / 4, 0),
    fatG: roundTo((energyKcal * fatPct) / 100 / 9, 0),
  };
}
