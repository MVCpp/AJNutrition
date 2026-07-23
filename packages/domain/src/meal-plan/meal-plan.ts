import { AppError } from '@ajnutrition/shared';
import type { DomainContext } from '../common/context';

export const MEAL_SLOTS = ['breakfast', 'snack1', 'lunch', 'snack2', 'dinner'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export type MealPlanStatus = 'draft' | 'active' | 'archived';

/**
 * Meal plan aggregate (§12.14). Targets are frozen at creation with full
 * provenance (which measurement session, which formulas, which PAL) — the
 * plan's numbers never drift when the patient is measured again.
 */
export interface MealPlan {
  readonly id: string;
  readonly patientId: string;
  readonly name: string;
  readonly days: number;
  readonly status: MealPlanStatus;
  readonly energyTargetKcal: number;
  readonly proteinTargetG: number;
  readonly carbohydrateTargetG: number;
  readonly fatTargetG: number;
  /** Serialized provenance of how the targets were derived. */
  readonly targetSourceJson: string;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlanItem {
  readonly id: string;
  readonly planId: string;
  readonly dayIndex: number;
  readonly mealSlot: MealSlot;
  readonly itemType: 'food' | 'recipe';
  readonly foodId: string | null;
  readonly recipeId: string | null;
  /** Grams for food items. */
  readonly grams: number | null;
  /** Portions for recipe items. */
  readonly portions: number | null;
  readonly displayOrder: number;
  readonly createdAt: string;
}

export function createMealPlan(
  input: {
    patientId: string;
    name: string;
    days: number;
    energyTargetKcal: number;
    proteinTargetG: number;
    carbohydrateTargetG: number;
    fatTargetG: number;
    targetSourceJson: string;
    notes?: string | undefined;
  },
  ctx: DomainContext,
): MealPlan {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'El nombre del plan es obligatorio.',
      fieldErrors: { name: ['required'] },
    });
  }
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 7) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'El plan debe tener entre 1 y 7 días.',
      fieldErrors: { days: ['invalid'] },
    });
  }
  if (
    !Number.isFinite(input.energyTargetKcal) ||
    input.energyTargetKcal < 500 ||
    input.energyTargetKcal > 8000
  ) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'La meta energética debe estar entre 500 y 8000 kcal.',
      fieldErrors: { energyTargetKcal: ['out_of_range'] },
    });
  }
  const nowIso = ctx.now().toISOString();
  return {
    id: ctx.newId(),
    patientId: input.patientId,
    name,
    days: input.days,
    status: 'draft',
    energyTargetKcal: input.energyTargetKcal,
    proteinTargetG: input.proteinTargetG,
    carbohydrateTargetG: input.carbohydrateTargetG,
    fatTargetG: input.fatTargetG,
    targetSourceJson: input.targetSourceJson,
    notes: input.notes?.trim() || null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function createPlanItem(
  input: {
    planId: string;
    planDays: number;
    dayIndex: number;
    mealSlot: MealSlot;
    item:
      | { type: 'food'; foodId: string; grams: number }
      | { type: 'recipe'; recipeId: string; portions: number };
    displayOrder: number;
  },
  ctx: DomainContext,
): PlanItem {
  if (!Number.isInteger(input.dayIndex) || input.dayIndex < 0 || input.dayIndex >= input.planDays) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'El día indicado no existe en este plan.',
      fieldErrors: { dayIndex: ['invalid'] },
    });
  }
  if (input.item.type === 'food') {
    if (!Number.isFinite(input.item.grams) || input.item.grams <= 0 || input.item.grams > 5000) {
      throw new AppError({
        code: 'VALIDATION',
        message: 'Los gramos deben estar entre 1 y 5000.',
        fieldErrors: { grams: ['invalid'] },
      });
    }
  } else if (
    !Number.isFinite(input.item.portions) ||
    input.item.portions <= 0 ||
    input.item.portions > 20
  ) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'Las porciones deben estar entre 0.25 y 20.',
      fieldErrors: { portions: ['invalid'] },
    });
  }
  return {
    id: ctx.newId(),
    planId: input.planId,
    dayIndex: input.dayIndex,
    mealSlot: input.mealSlot,
    itemType: input.item.type,
    foodId: input.item.type === 'food' ? input.item.foodId : null,
    recipeId: input.item.type === 'recipe' ? input.item.recipeId : null,
    grams: input.item.type === 'food' ? input.item.grams : null,
    portions: input.item.type === 'recipe' ? input.item.portions : null,
    displayOrder: input.displayOrder,
    createdAt: ctx.now().toISOString(),
  };
}
