import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { MealPlan, PlanItem } from '@ajnutrition/domain';
import type { HydratedPlanItem, MealPlanRepository } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';
import { mealPlans, planItems } from '../schema-meal-plans';
import { foodNutrientValues, foods } from '../schema-foods';
import { recipeIngredients, recipes } from '../schema-recipes';

export class SqliteMealPlanRepository implements MealPlanRepository {
  private readonly db: BetterSQLite3Database;

  constructor(connection: SqliteDatabase) {
    this.db = drizzle(connection);
  }

  insertPlan(plan: MealPlan): void {
    this.db
      .insert(mealPlans)
      .values({
        id: plan.id,
        patientId: plan.patientId,
        name: plan.name,
        days: plan.days,
        status: plan.status,
        energyTargetKcal: plan.energyTargetKcal,
        proteinTargetG: plan.proteinTargetG,
        carbohydrateTargetG: plan.carbohydrateTargetG,
        fatTargetG: plan.fatTargetG,
        targetSourceJson: plan.targetSourceJson,
        notes: plan.notes,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      })
      .run();
  }

  findPlanById(id: string): MealPlan | null {
    const row = this.db.select().from(mealPlans).where(eq(mealPlans.id, id)).get();
    return row ? { ...row } : null;
  }

  listByPatient(patientId: string): MealPlan[] {
    return this.db
      .select()
      .from(mealPlans)
      .where(eq(mealPlans.patientId, patientId))
      .orderBy(desc(mealPlans.createdAt))
      .all()
      .map((row) => ({ ...row }));
  }

  insertItem(item: PlanItem): void {
    this.db
      .insert(planItems)
      .values({
        id: item.id,
        planId: item.planId,
        dayIndex: item.dayIndex,
        mealSlot: item.mealSlot,
        itemType: item.itemType,
        foodId: item.foodId,
        recipeId: item.recipeId,
        grams: item.grams,
        portions: item.portions,
        displayOrder: item.displayOrder,
        createdAt: item.createdAt,
      })
      .run();
  }

  findItemById(itemId: string): PlanItem | null {
    const row = this.db.select().from(planItems).where(eq(planItems.id, itemId)).get();
    return row ? { ...row } : null;
  }

  deleteItem(itemId: string): void {
    this.db.delete(planItems).where(eq(planItems.id, itemId)).run();
  }

  countItems(planId: string, dayIndex: number, mealSlot: string): number {
    const row = this.db
      .select({ n: sql<number>`COUNT(*)` })
      .from(planItems)
      .where(
        and(
          eq(planItems.planId, planId),
          eq(planItems.dayIndex, dayIndex),
          eq(planItems.mealSlot, mealSlot as PlanItem['mealSlot']),
        ),
      )
      .get();
    return row?.n ?? 0;
  }

  listHydratedItems(planId: string): HydratedPlanItem[] {
    const items = this.db
      .select()
      .from(planItems)
      .where(eq(planItems.planId, planId))
      .orderBy(asc(planItems.dayIndex), asc(planItems.mealSlot), asc(planItems.displayOrder))
      .all();
    if (items.length === 0) return [];

    const foodIds = [...new Set(items.flatMap((i) => (i.foodId ? [i.foodId] : [])))];
    const recipeIds = [...new Set(items.flatMap((i) => (i.recipeId ? [i.recipeId] : [])))];

    const foodRows =
      foodIds.length > 0
        ? this.db.select().from(foods).where(inArray(foods.id, foodIds)).all()
        : [];
    const recipeRows =
      recipeIds.length > 0
        ? this.db.select().from(recipes).where(inArray(recipes.id, recipeIds)).all()
        : [];
    const ingredientRows =
      recipeIds.length > 0
        ? this.db
            .select()
            .from(recipeIngredients)
            .where(inArray(recipeIngredients.recipeId, recipeIds))
            .all()
        : [];
    const nutrientFoodIds = [...new Set([...foodIds, ...ingredientRows.map((row) => row.foodId)])];
    const nutrientRows =
      nutrientFoodIds.length > 0
        ? this.db
            .select()
            .from(foodNutrientValues)
            .where(inArray(foodNutrientValues.foodId, nutrientFoodIds))
            .all()
        : [];
    const nutrientsByFood = new Map<string, Record<string, number>>();
    for (const row of nutrientRows) {
      const map = nutrientsByFood.get(row.foodId) ?? {};
      map[row.nutrientId] = row.amount;
      nutrientsByFood.set(row.foodId, map);
    }

    return items.map((item) => {
      const hydrated: HydratedPlanItem = { item: { ...item } };
      if (item.foodId) {
        const food = foodRows.find((row) => row.id === item.foodId);
        if (food) {
          hydrated.food = {
            name: food.name,
            nutrients: nutrientsByFood.get(food.id) ?? {},
            basisGrams: 100,
          };
        }
      }
      if (item.recipeId) {
        const recipe = recipeRows.find((row) => row.id === item.recipeId);
        if (recipe) {
          hydrated.recipe = {
            name: recipe.name,
            yieldPortions: recipe.yieldPortions,
            ingredients: ingredientRows
              .filter((row) => row.recipeId === recipe.id)
              .map((row) => ({
                grams: row.grams,
                nutrients: nutrientsByFood.get(row.foodId) ?? {},
                basisGrams: 100,
              })),
          };
        }
      }
      return hydrated;
    });
  }
}
