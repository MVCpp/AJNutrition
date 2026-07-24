import { z } from 'zod';
import { AllergenIdSchema } from './allergen';

/** Food composition contracts (§12.9-12.11). All nutrient amounts per 100 g. */

export const FoodIdSchema = z.string().uuid();

const nonNegative = z.number().finite().min(0).max(100000);

const ALLERGEN_MAX = 11;

export const CreateFoodCommandSchema = z
  .object({
    name: z.string().trim().min(1, 'required').max(200, 'too_long'),
    brand: z.string().trim().max(100, 'too_long').optional(),
    category: z.string().trim().max(100, 'too_long').optional(),
    /** Required core; optional extras. Per 100 g. */
    energyKcal: nonNegative,
    proteinG: nonNegative,
    carbohydrateG: nonNegative,
    fatG: nonNegative,
    fiberG: nonNegative.optional(),
    sodiumMg: nonNegative.optional(),
    /** Base the values refer to; omitted → per 100 g. */
    basis: z
      .object({
        amount: z.number().finite().positive().max(100000),
        unit: z.enum(['g', 'oz', 'lb']),
      })
      .strict()
      .optional(),
    /** Structured allergen tags; drive hard-blocking in meal plans. */
    allergens: z.array(AllergenIdSchema).max(ALLERGEN_MAX).optional(),
  })
  .strict();
export type CreateFoodCommand = z.infer<typeof CreateFoodCommandSchema>;

/** Same shape as creation plus the target id; only custom foods are editable. */
export const UpdateFoodCommandSchema = CreateFoodCommandSchema.extend({
  foodId: FoodIdSchema,
});
export type UpdateFoodCommand = z.infer<typeof UpdateFoodCommandSchema>;

/** Allergen tags alone are editable on ANY food — including read-only catalog rows. */
export const SetFoodAllergensCommandSchema = z
  .object({
    foodId: FoodIdSchema,
    allergens: z.array(AllergenIdSchema).max(ALLERGEN_MAX),
  })
  .strict();
export type SetFoodAllergensCommand = z.infer<typeof SetFoodAllergensCommandSchema>;

export const SearchFoodsQuerySchema = z
  .object({ search: z.string().trim().max(100).optional() })
  .strict();
export type SearchFoodsQuery = z.infer<typeof SearchFoodsQuerySchema>;

/** CSV import result: per-row failures never abort the rest of the file. */
export const ImportFoodsResultDtoSchema = z
  .object({
    canceled: z.boolean(),
    imported: z.number().int().min(0),
    /** First rejected rows with their 1-based line number and reason. */
    skipped: z.array(z.object({ line: z.number().int(), reason: z.string() }).strict()),
    skippedTotal: z.number().int().min(0),
  })
  .strict();
export type ImportFoodsResultDto = z.infer<typeof ImportFoodsResultDtoSchema>;

export const FoodServingDtoSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    grams: z.number(),
  })
  .strict();
export type FoodServingDto = z.infer<typeof FoodServingDtoSchema>;

export const FoodNutrientDtoSchema = z
  .object({
    nutrientId: z.string(),
    nameEs: z.string(),
    amount: z.number(),
    unit: z.string(),
  })
  .strict();

export const FoodDtoSchema = z
  .object({
    id: FoodIdSchema,
    name: z.string(),
    brand: z.string().nullable(),
    category: z.string().nullable(),
    source: z.enum(['custom', 'fdc', 'import']),
    basisGrams: z.number(),
    nutrients: z.array(FoodNutrientDtoSchema),
    servings: z.array(FoodServingDtoSchema),
    allergens: z.array(z.string()),
    /** Data-quality signals, e.g. 'energy_macro_mismatch'. */
    warnings: z.array(z.string()),
    createdAt: z.string(),
  })
  .strict();
export type FoodDto = z.infer<typeof FoodDtoSchema>;
