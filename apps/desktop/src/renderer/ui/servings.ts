import type { FoodServingDto } from '@ajnutrition/shared';

/**
 * Household measures ("1 pieza = 30 g") as an INPUT aid.
 *
 * Everything downstream — plan items, recipe ingredients, totals, the shopping
 * list — stays in grams, which is what the nutrient data is expressed in.
 * Converting here, once, keeps a single unit in the domain while letting the
 * practitioner type the amount the way the patient will hear it.
 */

/** Accepts the decimal comma an es-MX keyboard produces. */
export function parseQuantity(raw: string): number | null {
  const value = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Grams for `quantity` units of a measure, rounded to 0.1 g — binary floats
 * would otherwise turn 3 × 30.1 into 90.30000000000001 and put that in the
 * record.
 */
export function servingToGrams(quantity: number, gramsPerServing: number): number {
  return Math.round(quantity * gramsPerServing * 10) / 10;
}

export function servingOptionLabel(serving: FoodServingDto): string {
  return `${serving.name} (${serving.grams} g)`;
}

/**
 * Resolves what the practitioner typed into grams. `servingId` empty = the
 * quantity already IS grams. Returns null when the input is not usable yet, so
 * the caller can keep the submit button disabled.
 */
export function resolveGrams(
  raw: string,
  servingId: string,
  servings: readonly FoodServingDto[],
): number | null {
  const quantity = parseQuantity(raw);
  if (quantity === null) return null;
  if (servingId === '') return quantity;
  const serving = servings.find((s) => s.id === servingId);
  // A measure that vanished (deleted in another screen) must not silently be
  // treated as grams — that would understate the amount by an order of magnitude.
  if (serving === undefined) return null;
  return servingToGrams(quantity, serving.grams);
}
