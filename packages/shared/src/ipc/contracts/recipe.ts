import { z } from 'zod';
import { FoodIdSchema } from './food';

/** Recipe and household-serving contracts (§12.12/§12.13). */

export const RecipeIdSchema = z.string().uuid();

export const AddFoodServingCommandSchema = z
  .object({
    foodId: FoodIdSchema,
    name: z.string().trim().min(1, 'required').max(50, 'too_long'),
    grams: z.number().finite().positive().max(5000),
  })
  .strict();
export type AddFoodServingCommand = z.infer<typeof AddFoodServingCommandSchema>;

export const CreateRecipeCommandSchema = z
  .object({
    name: z.string().trim().min(1, 'required').max(200, 'too_long'),
    description: z.string().trim().max(1000, 'too_long').optional(),
    yieldPortions: z.number().finite().positive().max(100),
    instructions: z.string().trim().max(5000, 'too_long').optional(),
    ingredients: z
      .array(
        z
          .object({
            foodId: FoodIdSchema,
            grams: z.number().finite().positive().max(10000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export type CreateRecipeCommand = z.infer<typeof CreateRecipeCommandSchema>;

/** Full replace of the recipe (metadata + ingredient list). */
export const UpdateRecipeCommandSchema = CreateRecipeCommandSchema.extend({
  recipeId: RecipeIdSchema,
});
export type UpdateRecipeCommand = z.infer<typeof UpdateRecipeCommandSchema>;

export const SearchRecipesQuerySchema = z
  .object({ search: z.string().trim().max(100).optional() })
  .strict();
export type SearchRecipesQuery = z.infer<typeof SearchRecipesQuerySchema>;

export const RecipeNutrientTotalDtoSchema = z
  .object({
    nutrientId: z.string(),
    nameEs: z.string(),
    unit: z.string(),
    amount: z.number(),
    /** False = some ingredient lacked data; the amount is a floor, not the truth. */
    complete: z.boolean(),
  })
  .strict();

export const RecipeDtoSchema = z
  .object({
    id: RecipeIdSchema,
    name: z.string(),
    description: z.string().nullable(),
    yieldPortions: z.number(),
    instructions: z.string().nullable(),
    ingredients: z.array(
      z
        .object({
          foodId: FoodIdSchema,
          foodName: z.string(),
          grams: z.number(),
        })
        .strict(),
    ),
    totals: z.array(RecipeNutrientTotalDtoSchema),
    perPortion: z.array(RecipeNutrientTotalDtoSchema),
    createdAt: z.string(),
  })
  .strict();
export type RecipeDto = z.infer<typeof RecipeDtoSchema>;
