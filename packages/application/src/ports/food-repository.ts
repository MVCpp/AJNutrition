import type { Food, FoodStatus } from '@ajnutrition/domain';

export interface FoodRepository {
  insert(food: Food): void;
  /** Full replace of the editable fields and every nutrient value. */
  update(food: Food): void;
  findById(id: string): Food | null;
  /** Flips ONLY the status: a full update() would needlessly rewrite every nutrient row. */
  setStatus(foodId: string, status: FoodStatus, updatedAt: string): void;
  /** SMAE equivalence for one group; replaces any previous value. */
  setEquivalence(
    foodId: string,
    groupId: string,
    gramsPerEquivalent: number,
    updatedAt: string,
  ): void;
  deleteEquivalence(foodId: string, groupId: string): void;
  /** Replaces ONLY the allergen tag set (legal on read-only catalog foods). */
  setAllergens(foodId: string, allergens: readonly string[], updatedAt: string): void;
  /** Accent-insensitive search on the normalized name; active foods by default. */
  search(searchNormalized: string | undefined, limit: number, includeArchived?: boolean): Food[];
}
