import { z } from 'zod';
import { PatientIdSchema } from './patient';
import { FoodIdSchema } from './food';
import { RecipeIdSchema } from './recipe';

/** Meal-plan contracts (§12.14-12.17, §15). */

export const MealPlanIdSchema = z.string().uuid();
export const MealSlotSchema = z.enum(['breakfast', 'snack1', 'lunch', 'snack2', 'dinner']);
export type MealSlotDto = z.infer<typeof MealSlotSchema>;

const MacroPctSchema = z
  .object({
    proteinPct: z.number().min(5).max(60),
    carbohydratePct: z.number().min(5).max(75),
    fatPct: z.number().min(10).max(60),
  })
  .strict()
  .refine((v) => Math.abs(v.proteinPct + v.carbohydratePct + v.fatPct - 100) <= 1, {
    message: 'macros_must_sum_100',
  });

export const CreateMealPlanCommandSchema = z
  .object({
    patientId: PatientIdSchema,
    name: z.string().trim().min(1, 'required').max(200, 'too_long'),
    days: z.number().int().min(1).max(7),
    macros: MacroPctSchema,
    basis: z.discriminatedUnion('type', [
      z
        .object({
          type: z.literal('measurement'),
          sessionId: z.string().uuid(),
          pal: z.number().min(1.0).max(2.5),
          adjustmentKcal: z.number().int().min(-2000).max(2000),
        })
        .strict(),
      z
        .object({
          type: z.literal('manual'),
          energyKcal: z.number().min(500).max(8000),
        })
        .strict(),
    ]),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();
export type CreateMealPlanCommand = z.infer<typeof CreateMealPlanCommandSchema>;

export const AddPlanItemCommandSchema = z
  .object({
    planId: MealPlanIdSchema,
    dayIndex: z.number().int().min(0).max(6),
    mealSlot: MealSlotSchema,
    item: z.discriminatedUnion('type', [
      z
        .object({
          type: z.literal('food'),
          foodId: FoodIdSchema,
          grams: z.number().positive().max(5000),
        })
        .strict(),
      z
        .object({
          type: z.literal('recipe'),
          recipeId: RecipeIdSchema,
          portions: z.number().positive().max(20),
        })
        .strict(),
    ]),
  })
  .strict();
export type AddPlanItemCommand = z.infer<typeof AddPlanItemCommandSchema>;

export const RemovePlanItemCommandSchema = z.object({ itemId: z.string().uuid() }).strict();
export type RemovePlanItemCommand = z.infer<typeof RemovePlanItemCommandSchema>;

export const GetMealPlanQuerySchema = z.object({ planId: MealPlanIdSchema }).strict();
export type GetMealPlanQuery = z.infer<typeof GetMealPlanQuerySchema>;

export const ListMealPlansQuerySchema = z.object({ patientId: PatientIdSchema }).strict();
export type ListMealPlansQuery = z.infer<typeof ListMealPlansQuerySchema>;

const PlanNutrientTotalSchema = z
  .object({
    nutrientId: z.string(),
    nameEs: z.string(),
    unit: z.string(),
    amount: z.number(),
    complete: z.boolean(),
  })
  .strict();

const PlanItemDtoSchema = z
  .object({
    id: z.string().uuid(),
    itemType: z.enum(['food', 'recipe']),
    label: z.string(),
    quantityLabel: z.string(),
    totals: z.array(PlanNutrientTotalSchema),
  })
  .strict();

const PlanMealDtoSchema = z
  .object({
    slot: MealSlotSchema,
    items: z.array(PlanItemDtoSchema),
    totals: z.array(PlanNutrientTotalSchema),
  })
  .strict();

const PlanDayDtoSchema = z
  .object({
    dayIndex: z.number().int(),
    meals: z.array(PlanMealDtoSchema),
    totals: z.array(PlanNutrientTotalSchema),
  })
  .strict();

export const MealPlanSummaryDtoSchema = z
  .object({
    id: MealPlanIdSchema,
    name: z.string(),
    days: z.number().int(),
    status: z.enum(['draft', 'active', 'archived']),
    energyTargetKcal: z.number(),
    createdAt: z.string(),
  })
  .strict();
export type MealPlanSummaryDto = z.infer<typeof MealPlanSummaryDtoSchema>;

export const MealPlanDtoSchema = z
  .object({
    id: MealPlanIdSchema,
    patientId: PatientIdSchema,
    name: z.string(),
    days: z.number().int(),
    status: z.enum(['draft', 'active', 'archived']),
    targets: z
      .object({
        energyKcal: z.number(),
        proteinG: z.number(),
        carbohydrateG: z.number(),
        fatG: z.number(),
      })
      .strict(),
    /** Parsed provenance of the targets (session/formulas/PAL/adjustment). */
    targetSource: z.record(z.string(), z.unknown()),
    /** Live allergy entries from the clinical history, for the warning strip. */
    allergies: z.array(z.string()),
    dayPlans: z.array(PlanDayDtoSchema),
    notes: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict();
export type MealPlanDto = z.infer<typeof MealPlanDtoSchema>;
