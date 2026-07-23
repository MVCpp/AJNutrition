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
  search(searchNormalized: string | undefined, limit: number): RecipeWithIngredientFoods[];
}

export interface FoodServingRepository {
  insert(serving: FoodServing): void;
  listByFoodIds(foodIds: string[]): FoodServing[];
}
