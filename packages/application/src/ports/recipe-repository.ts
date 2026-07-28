import type { FoodServing, Recipe } from '@ajnutrition/domain';

/** Recipe hydrated with the ingredient foods' data needed for totals. */
export interface RecipeWithIngredientFoods {
  recipe: Recipe;
  ingredientFoods: Array<{
    foodId: string;
    foodName: string;
    grams: number;
    nutrients: Record<string, number>;
    basisGrams: number;
  }>;
}

export interface RecipeRepository {
  insert(recipe: Recipe): void;
  findById(id: string): Recipe | null;
  /** Full replace of the editable fields and the ingredient list. */
  update(recipe: Recipe): void;
  /** Flips ONLY the status: a full update() would rewrite the ingredient rows. */
  setStatus(recipeId: string, status: 'active' | 'archived', updatedAt: string): void;
  search(
    searchNormalized: string | undefined,
    limit: number,
    includeArchived?: boolean,
  ): RecipeWithIngredientFoods[];
}

export interface FoodServingRepository {
  insert(serving: FoodServing): void;
  listByFoodIds(foodIds: string[]): FoodServing[];
  findById(servingId: string): FoodServing | null;
  /** Removing a household measure never touches the food or any plan item. */
  deleteById(servingId: string): void;
}
