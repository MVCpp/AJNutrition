import { AppError } from '@ajnutrition/shared';
import type { DomainContext } from '../common/context';
import { normalizeFoodName } from '../food/food';

/** Recipe aggregate (§12.13). Nutrients are computed from ingredients at read time. */
export interface Recipe {
  readonly id: string;
  readonly name: string;
  readonly nameNormalized: string;
  readonly description: string | null;
  readonly yieldPortions: number;
  readonly instructions: string | null;
  readonly status: 'active' | 'archived';
  readonly ingredients: ReadonlyArray<{ foodId: string; grams: number; displayOrder: number }>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function createRecipe(
  input: {
    name: string;
    description?: string | undefined;
    yieldPortions: number;
    instructions?: string | undefined;
    ingredients: Array<{ foodId: string; grams: number }>;
  },
  ctx: DomainContext,
): Recipe {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'El nombre de la receta es obligatorio.',
      fieldErrors: { name: ['required'] },
    });
  }
  if (!Number.isFinite(input.yieldPortions) || input.yieldPortions <= 0) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'El número de porciones debe ser mayor que cero.',
      fieldErrors: { yieldPortions: ['invalid'] },
    });
  }
  if (input.ingredients.length === 0) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'La receta requiere al menos un ingrediente.',
      fieldErrors: { ingredients: ['required'] },
    });
  }
  const seen = new Set<string>();
  for (const ingredient of input.ingredients) {
    if (seen.has(ingredient.foodId)) {
      throw new AppError({
        code: 'VALIDATION',
        message: 'Un alimento no puede repetirse en la misma receta.',
        fieldErrors: { ingredients: ['duplicate_food'] },
      });
    }
    seen.add(ingredient.foodId);
    if (!Number.isFinite(ingredient.grams) || ingredient.grams <= 0 || ingredient.grams > 10000) {
      throw new AppError({
        code: 'VALIDATION',
        message: 'La cantidad de cada ingrediente debe estar entre 1 y 10000 g.',
        fieldErrors: { ingredients: ['invalid_grams'] },
      });
    }
  }
  const nowIso = ctx.now().toISOString();
  return {
    id: ctx.newId(),
    name,
    nameNormalized: normalizeFoodName(name),
    description: input.description?.trim() || null,
    yieldPortions: input.yieldPortions,
    instructions: input.instructions?.trim() || null,
    status: 'active',
    ingredients: input.ingredients.map((ingredient, index) => ({
      foodId: ingredient.foodId,
      grams: ingredient.grams,
      displayOrder: index,
    })),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/** Household serving for a food (§12.12): '1 pieza' = N grams, always explicit. */
export interface FoodServing {
  readonly id: string;
  readonly foodId: string;
  readonly name: string;
  readonly grams: number;
  readonly createdAt: string;
}

export function createFoodServing(
  input: { foodId: string; name: string; grams: number },
  ctx: DomainContext,
): FoodServing {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'El nombre de la porción es obligatorio.',
      fieldErrors: { name: ['required'] },
    });
  }
  if (!Number.isFinite(input.grams) || input.grams <= 0 || input.grams > 5000) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'Los gramos de la porción deben estar entre 1 y 5000.',
      fieldErrors: { grams: ['invalid'] },
    });
  }
  return {
    id: ctx.newId(),
    foodId: input.foodId,
    name,
    grams: input.grams,
    createdAt: ctx.now().toISOString(),
  };
}
