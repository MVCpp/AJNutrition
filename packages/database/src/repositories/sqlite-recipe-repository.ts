import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { FoodServing, Recipe } from '@ajnutrition/domain';
import type {
  FoodServingRepository,
  RecipeRepository,
  RecipeWithIngredientFoods,
} from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';
import { foodServings, recipeIngredients, recipes } from '../schema-recipes';
import { foodNutrientValues, foods } from '../schema-foods';

export class SqliteRecipeRepository implements RecipeRepository {
  private readonly db: BetterSQLite3Database;

  constructor(connection: SqliteDatabase) {
    this.db = drizzle(connection);
  }

  insert(recipe: Recipe): void {
    this.db
      .insert(recipes)
      .values({
        id: recipe.id,
        name: recipe.name,
        nameNormalized: recipe.nameNormalized,
        description: recipe.description,
        yieldPortions: recipe.yieldPortions,
        instructions: recipe.instructions,
        status: recipe.status,
        createdAt: recipe.createdAt,
        updatedAt: recipe.updatedAt,
      })
      .run();
    for (const ingredient of recipe.ingredients) {
      this.db
        .insert(recipeIngredients)
        .values({
          recipeId: recipe.id,
          foodId: ingredient.foodId,
          grams: ingredient.grams,
          displayOrder: ingredient.displayOrder,
        })
        .run();
    }
  }

  findById(id: string): Recipe | null {
    const row = this.db.select().from(recipes).where(eq(recipes.id, id)).get();
    if (!row) return null;
    const ingredients = this.db
      .select()
      .from(recipeIngredients)
      .where(eq(recipeIngredients.recipeId, id))
      .orderBy(asc(recipeIngredients.displayOrder))
      .all()
      .map((ingredient) => ({
        foodId: ingredient.foodId,
        grams: ingredient.grams,
        displayOrder: ingredient.displayOrder,
      }));
    return { ...row, ingredients };
  }

  update(recipe: Recipe): void {
    this.db
      .update(recipes)
      .set({
        name: recipe.name,
        nameNormalized: recipe.nameNormalized,
        description: recipe.description,
        yieldPortions: recipe.yieldPortions,
        instructions: recipe.instructions,
        updatedAt: recipe.updatedAt,
      })
      .where(eq(recipes.id, recipe.id))
      .run();
    this.db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipe.id)).run();
    for (const ingredient of recipe.ingredients) {
      this.db
        .insert(recipeIngredients)
        .values({
          recipeId: recipe.id,
          foodId: ingredient.foodId,
          grams: ingredient.grams,
          displayOrder: ingredient.displayOrder,
        })
        .run();
    }
  }

  search(searchNormalized: string | undefined, limit: number): RecipeWithIngredientFoods[] {
    const filters = [eq(recipes.status, 'active')];
    if (searchNormalized && searchNormalized.length > 0) {
      const escaped = searchNormalized.replace(/([%_\\])/g, '\\$1');
      filters.push(sql`${recipes.nameNormalized} LIKE ${`%${escaped}%`} ESCAPE '\\'`);
    }
    const recipeRows = this.db
      .select()
      .from(recipes)
      .where(and(...filters))
      .orderBy(asc(recipes.nameNormalized))
      .limit(limit)
      .all();
    if (recipeRows.length === 0) return [];

    const recipeIds = recipeRows.map((r) => r.id);
    const ingredientRows = this.db
      .select({
        recipeId: recipeIngredients.recipeId,
        foodId: recipeIngredients.foodId,
        grams: recipeIngredients.grams,
        displayOrder: recipeIngredients.displayOrder,
        foodName: foods.name,
      })
      .from(recipeIngredients)
      .innerJoin(foods, eq(foods.id, recipeIngredients.foodId))
      .where(inArray(recipeIngredients.recipeId, recipeIds))
      .all();

    const foodIds = [...new Set(ingredientRows.map((row) => row.foodId))];
    const nutrientRows =
      foodIds.length > 0
        ? this.db
            .select()
            .from(foodNutrientValues)
            .where(inArray(foodNutrientValues.foodId, foodIds))
            .all()
        : [];
    const nutrientsByFood = new Map<string, Record<string, number>>();
    for (const row of nutrientRows) {
      const map = nutrientsByFood.get(row.foodId) ?? {};
      map[row.nutrientId] = row.amount;
      nutrientsByFood.set(row.foodId, map);
    }

    return recipeRows.map((row) => ({
      recipe: {
        id: row.id,
        name: row.name,
        nameNormalized: row.nameNormalized,
        description: row.description,
        yieldPortions: row.yieldPortions,
        instructions: row.instructions,
        status: row.status,
        ingredients: ingredientRows
          .filter((ingredient) => ingredient.recipeId === row.id)
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((ingredient) => ({
            foodId: ingredient.foodId,
            grams: ingredient.grams,
            displayOrder: ingredient.displayOrder,
          })),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      ingredientFoods: ingredientRows
        .filter((ingredient) => ingredient.recipeId === row.id)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((ingredient) => ({
          foodId: ingredient.foodId,
          foodName: ingredient.foodName,
          grams: ingredient.grams,
          nutrients: nutrientsByFood.get(ingredient.foodId) ?? {},
          basisGrams: 100,
        })),
    }));
  }
}

export class SqliteFoodServingRepository implements FoodServingRepository {
  private readonly db: BetterSQLite3Database;

  constructor(connection: SqliteDatabase) {
    this.db = drizzle(connection);
  }

  insert(serving: FoodServing): void {
    this.db
      .insert(foodServings)
      .values({
        id: serving.id,
        foodId: serving.foodId,
        name: serving.name,
        grams: serving.grams,
        createdAt: serving.createdAt,
      })
      .run();
  }

  listByFoodIds(foodIds: string[]): FoodServing[] {
    if (foodIds.length === 0) return [];
    return this.db
      .select()
      .from(foodServings)
      .where(inArray(foodServings.foodId, foodIds))
      .orderBy(asc(foodServings.name))
      .all()
      .map((row) => ({
        id: row.id,
        foodId: row.foodId,
        name: row.name,
        grams: row.grams,
        createdAt: row.createdAt,
      }));
  }
}
