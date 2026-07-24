import type { Food } from '@ajnutrition/domain';

export interface FoodRepository {
  insert(food: Food): void;
  /** Full replace of the editable fields and every nutrient value. */
  update(food: Food): void;
  findById(id: string): Food | null;
  /** Accent-insensitive search on the normalized name; active foods only. */
  search(searchNormalized: string | undefined, limit: number): Food[];
}
