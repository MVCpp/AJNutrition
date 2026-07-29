import { z } from 'zod';
import { EQUIVALENCE_GROUP_IDS } from '../../equivalences';
import { PatientIdSchema } from './patient';
import { FoodIdSchema } from './food';
import { RecipeIdSchema } from './recipe';

/** Meal-plan contracts (§12.14-12.17, §15). */

export const MealPlanIdSchema = z.string().uuid();

/** REE formulas a plan may use as its energy basis (must exist frozen in the session). */
export const ReeFormulaIdSchema = z.enum([
  'mifflin_st_jeor_ree',
  'harris_benedict_ree',
  'harris_benedict_revised_ree',
  'katch_mcardle_ree',
  'cunningham_ree',
  'who_fao_unu_ree',
  'ireton_jones_ree',
]);
export type ReeFormulaIdDto = z.infer<typeof ReeFormulaIdSchema>;

/** Short display names, shared by renderer and PDF reporting. */
export const REE_FORMULA_LABELS: Record<ReeFormulaIdDto, string> = {
  mifflin_st_jeor_ree: 'Mifflin-St Jeor',
  harris_benedict_ree: 'Harris-Benedict (original)',
  harris_benedict_revised_ree: 'Harris-Benedict (revisada 1984)',
  katch_mcardle_ree: 'Katch-McArdle',
  cunningham_ree: 'Cunningham',
  who_fao_unu_ree: 'OMS/FAO/UNU',
  ireton_jones_ree: 'Ireton-Jones',
};
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
    /** Optional owning consultation (must belong to the same patient). */
    consultationId: z.string().uuid().optional(),
    macros: MacroPctSchema,
    basis: z.discriminatedUnion('type', [
      z
        .object({
          type: z.literal('measurement'),
          sessionId: z.string().uuid(),
          /** Omitted → Mifflin-St Jeor (v1 default). */
          reeFormulaId: ReeFormulaIdSchema.optional(),
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
          /** Exactly one of `grams` or `serving` — see the refinement below. */
          grams: z.number().positive().max(5000).optional(),
          /**
           * Amount expressed in a household measure. The renderer names the
           * measure and the quantity; the MAIN process looks the measure up
           * and computes the grams, so a wrong or stale client cannot store a
           * label that disagrees with the amount.
           */
          serving: z
            .object({
              servingId: z.string().uuid(),
              quantity: z.number().positive().max(100),
            })
            .strict()
            .optional(),
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
  .strict()
  // A discriminated union may not carry its own refinement, so the
  // exactly-one-of rule lives here: a food amount is either grams or a
  // household measure, never both and never neither.
  .refine(
    (command) =>
      command.item.type !== 'food' ||
      (command.item.grams === undefined) !== (command.item.serving === undefined),
    { message: 'grams_or_serving', path: ['item'] },
  );
export type AddPlanItemCommand = z.infer<typeof AddPlanItemCommandSchema>;

export const RemovePlanItemCommandSchema = z.object({ itemId: z.string().uuid() }).strict();
export type RemovePlanItemCommand = z.infer<typeof RemovePlanItemCommandSchema>;

export const GetMealPlanQuerySchema = z.object({ planId: MealPlanIdSchema }).strict();
export type GetMealPlanQuery = z.infer<typeof GetMealPlanQuerySchema>;

export const ListMealPlansQuerySchema = z.object({ patientId: PatientIdSchema }).strict();
export type ListMealPlansQuery = z.infer<typeof ListMealPlansQuerySchema>;

/** Only forward transitions are requestable; "draft" is never a target. */
export const SetPlanStatusCommandSchema = z
  .object({ planId: MealPlanIdSchema, status: z.enum(['active', 'archived']) })
  .strict();
export type SetPlanStatusCommand = z.infer<typeof SetPlanStatusCommandSchema>;

export const CopyPlanDayCommandSchema = z
  .object({
    planId: MealPlanIdSchema,
    fromDayIndex: z.number().int().min(0),
    toDayIndex: z.number().int().min(0),
  })
  .strict();
export type CopyPlanDayCommand = z.infer<typeof CopyPlanDayCommandSchema>;

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
    /** Energy this slot is meant to carry; null when no split is configured. */
    targetKcal: z.number().nullable(),
  })
  .strict();

const PlanDayDtoSchema = z
  .object({
    dayIndex: z.number().int(),
    meals: z.array(PlanMealDtoSchema),
    totals: z.array(PlanNutrientTotalSchema),
    /** SMAE equivalentes counted for the day, for foods that have one recorded. */
    equivalents: z.array(z.object({ groupId: z.string(), count: z.number() }).strict()),
  })
  .strict();

export const MealPlanSummaryDtoSchema = z
  .object({
    id: MealPlanIdSchema,
    name: z.string(),
    days: z.number().int(),
    status: z.enum(['draft', 'active', 'archived']),
    energyTargetKcal: z.number(),
    consultationId: z.string().uuid().nullable(),
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
    consultationId: z.string().uuid().nullable(),
    /** Live allergy entries from the clinical history, for the warning strip. */
    allergies: z.array(z.string()),
    dayPlans: z.array(PlanDayDtoSchema),
    /** Prescribed equivalentes per group; null when not configured. */
    equivalentTargets: z.record(z.string(), z.number()).nullable(),
    /** Percent of the day's energy per slot; null when not configured. */
    mealDistribution: z
      .object({
        breakfast: z.number(),
        snack1: z.number(),
        lunch: z.number(),
        snack2: z.number(),
        dinner: z.number(),
      })
      .strict()
      .nullable(),
    notes: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict();
export type MealPlanDto = z.infer<typeof MealPlanDtoSchema>;

export const ShoppingListQuerySchema = z.object({ planId: MealPlanIdSchema }).strict();
export type ShoppingListQuery = z.infer<typeof ShoppingListQuerySchema>;

export const ShoppingListItemDtoSchema = z
  .object({
    foodId: FoodIdSchema,
    foodName: z.string(),
    brand: z.string().nullable(),
    totalGrams: z.number(),
  })
  .strict();
export type ShoppingListItemDto = z.infer<typeof ShoppingListItemDtoSchema>;

export const ShoppingListDtoSchema = z
  .object({
    planId: MealPlanIdSchema,
    planName: z.string(),
    days: z.number().int(),
    items: z.array(ShoppingListItemDtoSchema),
  })
  .strict();
export type ShoppingListDto = z.infer<typeof ShoppingListDtoSchema>;

/** Substitutions: isoenergetic swap suggestions for a food plan item. */
export const SuggestSubstitutesQuerySchema = z.object({ itemId: z.string().uuid() }).strict();
export type SuggestSubstitutesQuery = z.infer<typeof SuggestSubstitutesQuerySchema>;

export const SubstituteDtoSchema = z
  .object({
    foodId: FoodIdSchema,
    name: z.string(),
    brand: z.string().nullable(),
    category: z.string().nullable(),
    /** Portion matching the original item's energy, rounded to 5 g. */
    grams: z.number(),
    energyKcal: z.number(),
    proteinG: z.number(),
    carbohydrateG: z.number(),
    fatG: z.number(),
    /** 0 (identical macro profile) … 200 (opposite); lower is better. */
    profileDistance: z.number(),
  })
  .strict();
export type SubstituteDto = z.infer<typeof SubstituteDtoSchema>;

export const SubstituteSuggestionsDtoSchema = z
  .object({
    itemId: z.string().uuid(),
    original: z
      .object({
        foodId: FoodIdSchema,
        name: z.string(),
        grams: z.number(),
        energyKcal: z.number(),
        proteinG: z.number(),
        carbohydrateG: z.number(),
        fatG: z.number(),
      })
      .strict(),
    suggestions: z.array(SubstituteDtoSchema),
  })
  .strict();
export type SubstituteSuggestionsDto = z.infer<typeof SubstituteSuggestionsDtoSchema>;

export const ReplacePlanItemCommandSchema = z
  .object({
    itemId: z.string().uuid(),
    foodId: FoodIdSchema,
    grams: z.number().positive().max(5000),
  })
  .strict();
export type ReplacePlanItemCommand = z.infer<typeof ReplacePlanItemCommandSchema>;

/**
 * Reuses an existing plan as the starting point for another one — the same
 * week's structure for a new patient, or a new cycle for the same one.
 */
export const DuplicateMealPlanCommandSchema = z
  .object({
    planId: MealPlanIdSchema,
    /** Omit to duplicate onto the same patient. */
    targetPatientId: PatientIdSchema.optional(),
    name: z.string().trim().min(1, 'required').max(120, 'too_long'),
  })
  .strict();
export type DuplicateMealPlanCommand = z.infer<typeof DuplicateMealPlanCommandSchema>;

/**
 * How the day's energy is split across the five slots, in percent. Mexican
 * plan sheets are written this way ("desayuno 25 %, comida 30 %"), and it
 * turns a day-level target into something checkable meal by meal.
 */
export const SetMealDistributionCommandSchema = z
  .object({
    planId: MealPlanIdSchema,
    /** Null clears the per-meal targets. */
    distribution: z
      .object({
        breakfast: z.number().min(0).max(100),
        snack1: z.number().min(0).max(100),
        lunch: z.number().min(0).max(100),
        snack2: z.number().min(0).max(100),
        dinner: z.number().min(0).max(100),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine(
    (command) =>
      command.distribution === null ||
      Math.abs(Object.values(command.distribution).reduce((sum, value) => sum + value, 0) - 100) <
        0.5,
    { message: 'must_sum_100', path: ['distribution'] },
  );
export type SetMealDistributionCommand = z.infer<typeof SetMealDistributionCommandSchema>;

/**
 * Prescribed raciones per group for this plan ("4 cereales sin grasa, 3 AOA
 * bajo aporte de grasa"). Counting happens against the equivalences the
 * practitioner recorded per food; the app still invents no gram sizes.
 */
export const SetEquivalentTargetsCommandSchema = z
  .object({
    planId: MealPlanIdSchema,
    /** Null clears the prescription. */
    targets: z.record(z.enum(EQUIVALENCE_GROUP_IDS), z.number().min(0).max(40)).nullable(),
  })
  .strict();
export type SetEquivalentTargetsCommand = z.infer<typeof SetEquivalentTargetsCommandSchema>;
