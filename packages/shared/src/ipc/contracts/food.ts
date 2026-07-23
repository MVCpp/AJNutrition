import { z } from 'zod';

/** Food composition contracts (§12.9-12.11). All nutrient amounts per 100 g. */

export const FoodIdSchema = z.string().uuid();

const nonNegative = z.number().finite().min(0).max(100000);

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
  })
  .strict();
export type CreateFoodCommand = z.infer<typeof CreateFoodCommandSchema>;

export const SearchFoodsQuerySchema = z
  .object({ search: z.string().trim().max(100).optional() })
  .strict();
export type SearchFoodsQuery = z.infer<typeof SearchFoodsQuerySchema>;

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
    /** Data-quality signals, e.g. 'energy_macro_mismatch'. */
    warnings: z.array(z.string()),
    createdAt: z.string(),
  })
  .strict();
export type FoodDto = z.infer<typeof FoodDtoSchema>;
