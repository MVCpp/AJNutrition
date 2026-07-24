import type { MealPlan, PlanItem } from '@ajnutrition/domain';

/** Plan item hydrated with the catalog data needed for totals. */
export interface HydratedPlanItem {
  item: PlanItem;
  /** Food items: name + nutrients per basis. */
  food?:
    | {
        foodId: string;
        name: string;
        brand: string | null;
        nutrients: Record<string, number>;
        basisGrams: number;
      }
    | undefined;
  /** Recipe items: name + per-portion computation inputs. */
  recipe?:
    | {
        name: string;
        yieldPortions: number;
        ingredients: Array<{
          foodId: string;
          foodName: string;
          foodBrand: string | null;
          grams: number;
          nutrients: Record<string, number>;
          basisGrams: number;
        }>;
      }
    | undefined;
}

export interface MealPlanRepository {
  insertPlan(plan: MealPlan): void;
  findPlanById(id: string): MealPlan | null;
  listByPatient(patientId: string): MealPlan[];
  updatePlanStatus(planId: string, status: MealPlan['status'], updatedAt: string): void;
  /** Structured allergen tags of a food / of every ingredient of a recipe. */
  foodAllergenIds(foodId: string): string[];
  recipeAllergenIds(recipeId: string): string[];
  insertItem(item: PlanItem): void;
  findItemById(itemId: string): PlanItem | null;
  listItemsByDay(planId: string, dayIndex: number): PlanItem[];
  deleteItem(itemId: string): void;
  countItems(planId: string, dayIndex: number, mealSlot: string): number;
  listHydratedItems(planId: string): HydratedPlanItem[];
}
