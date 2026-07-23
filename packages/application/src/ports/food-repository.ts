import type { Food } from '@ajnutrition/domain';

export interface FoodRepository {
  insert(food: Food): void;
  findById(id: string): Food | null;
  /** Accent-insensitive search on the normalized name; active foods only. */
  search(searchNormalized: string | undefined, limit: number): Food[];
}
