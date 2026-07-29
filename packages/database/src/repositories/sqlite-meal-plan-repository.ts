import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { MealPlan, PlanItem } from '@ajnutrition/domain';
import type { HydratedPlanItem, MealPlanRepository } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';
import { mealPlans, planItems, planVersions } from '../schema-meal-plans';
import { foodAllergens, foodNutrientValues, foodEquivalences, foods } from '../schema-foods';
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
        mealDistributionJson: plan.mealDistributionJson,
        equivalentTargetsJson: plan.equivalentTargetsJson,
        consultationId: plan.consultationId,
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

  updatePlanStatus(planId: string, status: MealPlan['status'], updatedAt: string): void {
    this.db.update(mealPlans).set({ status, updatedAt }).where(eq(mealPlans.id, planId)).run();
  }

  foodAllergenIds(foodId: string): string[] {
    return this.db
      .select({ allergenId: foodAllergens.allergenId })
      .from(foodAllergens)
      .where(eq(foodAllergens.foodId, foodId))
      .all()
      .map((row) => row.allergenId);
  }

  recipeAllergenIds(recipeId: string): string[] {
    const rows = this.db
      .select({ allergenId: foodAllergens.allergenId })
      .from(recipeIngredients)
      .innerJoin(foodAllergens, eq(foodAllergens.foodId, recipeIngredients.foodId))
      .where(eq(recipeIngredients.recipeId, recipeId))
      .all();
    return [...new Set(rows.map((row) => row.allergenId))];
  }

  insertVersion(version: {
    id: string;
    planId: string;
    createdAt: string;
    label: string;
    snapshotText: string;
    snapshotJson: string;
  }): void {
    this.db.insert(planVersions).values(version).run();
  }

  listVersions(planId: string): Array<{
    id: string;
    createdAt: string;
    label: string;
    snapshotText: string;
  }> {
    return this.db
      .select()
      .from(planVersions)
      .where(eq(planVersions.planId, planId))
      .orderBy(desc(planVersions.createdAt))
      .all()
      .map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        label: row.label,
        snapshotText: row.snapshotText,
      }));
  }

  setEquivalentTargets(planId: string, json: string | null, updatedAt: string): void {
    this.db
      .update(mealPlans)
      .set({ equivalentTargetsJson: json, updatedAt })
      .where(eq(mealPlans.id, planId))
      .run();
  }

  setMealDistribution(planId: string, json: string | null, updatedAt: string): void {
    this.db
      .update(mealPlans)
      .set({ mealDistributionJson: json, updatedAt })
      .where(eq(mealPlans.id, planId))
      .run();
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
        servingLabel: item.servingLabel,
        servingQuantity: item.servingQuantity,
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

  listItemsByDay(planId: string, dayIndex: number): PlanItem[] {
    return this.db
      .select()
      .from(planItems)
      .where(and(eq(planItems.planId, planId), eq(planItems.dayIndex, dayIndex)))
      .orderBy(asc(planItems.mealSlot), asc(planItems.displayOrder))
      .all()
      .map((row) => ({ ...row }));
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
    const basisByFood = new Map<string, number>();
    for (const row of nutrientRows) {
      const map = nutrientsByFood.get(row.foodId) ?? {};
      map[row.nutrientId] = row.amount;
      nutrientsByFood.set(row.foodId, map);
      basisByFood.set(row.foodId, row.basisGrams);
    }
    const equivalenceRows =
      foodIds.length > 0
        ? this.db
            .select()
            .from(foodEquivalences)
            .where(inArray(foodEquivalences.foodId, foodIds))
            .all()
        : [];

    const ingredientFoodRows =
      ingredientRows.length > 0
        ? this.db
            .select()
            .from(foods)
            .where(inArray(foods.id, [...new Set(ingredientRows.map((row) => row.foodId))]))
            .all()
        : [];

    return items.map((item) => {
      const hydrated: HydratedPlanItem = { item: { ...item } };
      if (item.foodId) {
        const food = foodRows.find((row) => row.id === item.foodId);
        if (food) {
          hydrated.food = {
            foodId: food.id,
            name: food.name,
            brand: food.brand,
            nutrients: nutrientsByFood.get(food.id) ?? {},
            basisGrams: basisByFood.get(food.id) ?? 100,
            equivalences: equivalenceRows
              .filter((row) => row.foodId === food.id)
              .map((row) => ({
                groupId: row.groupId,
                gramsPerEquivalent: row.gramsPerEquivalent,
              })),
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
              .map((row) => {
                const ingredientFood = ingredientFoodRows.find((f) => f.id === row.foodId);
                return {
                  foodId: row.foodId,
                  foodName: ingredientFood?.name ?? '',
                  foodBrand: ingredientFood?.brand ?? null,
                  grams: row.grams,
                  nutrients: nutrientsByFood.get(row.foodId) ?? {},
                  basisGrams: basisByFood.get(row.foodId) ?? 100,
                };
              }),
          };
        }
      }
      return hydrated;
    });
  }
}
