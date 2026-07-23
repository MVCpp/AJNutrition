import { roundTo } from './units';

/**
 * Core nutrient registry (§12.10). v1 covers energy + macronutrients + the
 * two micros most relevant to early clinical use; the EAV storage model
 * (food_nutrient_values) extends to the full micronutrient set without
 * schema changes.
 */

export interface NutrientDefinition {
  id: string;
  nameEs: string;
  unit: string;
  category: 'energy' | 'macronutrient' | 'micronutrient';
}

export const NUTRIENTS: Record<string, NutrientDefinition> = {
  energy_kcal: { id: 'energy_kcal', nameEs: 'Energía', unit: 'kcal', category: 'energy' },
  protein_g: { id: 'protein_g', nameEs: 'Proteínas', unit: 'g', category: 'macronutrient' },
  carbohydrate_g: {
    id: 'carbohydrate_g',
    nameEs: 'Hidratos de carbono',
    unit: 'g',
    category: 'macronutrient',
  },
  fat_g: { id: 'fat_g', nameEs: 'Grasas', unit: 'g', category: 'macronutrient' },
  fiber_g: { id: 'fiber_g', nameEs: 'Fibra', unit: 'g', category: 'macronutrient' },
  sodium_mg: { id: 'sodium_mg', nameEs: 'Sodio', unit: 'mg', category: 'micronutrient' },
};

export type NutrientId = keyof typeof NUTRIENTS;

export function isKnownNutrient(id: string): id is NutrientId {
  return id in NUTRIENTS;
}

/**
 * Energy from macronutrients using the Atwater general factors (4/4/9).
 * Source: Merrill AL, Watt BK. Energy value of foods: basis and derivation.
 * USDA Agriculture Handbook No. 74. Washington, DC: USDA; 1973.
 */
export function atwaterEnergyKcal(proteinG: number, carbohydrateG: number, fatG: number): number {
  return roundTo(4 * proteinG + 4 * carbohydrateG + 9 * fatG, 0);
}

/**
 * Coherence check between declared energy and Atwater-computed energy.
 * A deviation above the tolerance yields a WARNING (data-quality signal,
 * e.g. a typo in macros) — never a hard rejection: fiber conventions and
 * rounding legitimately produce differences.
 */
export function energyCoherenceWarning(
  declaredKcal: number,
  proteinG: number,
  carbohydrateG: number,
  fatG: number,
  tolerance = 0.15,
): string | null {
  const computed = atwaterEnergyKcal(proteinG, carbohydrateG, fatG);
  if (computed === 0 && declaredKcal === 0) return null;
  const reference = Math.max(computed, declaredKcal, 1);
  return Math.abs(computed - declaredKcal) / reference > tolerance ? 'energy_macro_mismatch' : null;
}
