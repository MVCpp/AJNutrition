import {
  createFoodServing,
  createRecipe,
  normalizeFoodName,
  setRecipeStatus,
  type DomainContext,
} from '@ajnutrition/domain';
import { computeRecipeTotals, NUTRIENTS, perPortion } from '@ajnutrition/nutrition-engine';
import {
  AppError,
  type AddFoodServingCommand,
  type DeleteFoodServingCommand,
  type CreateRecipeCommand,
  type UpdateRecipeCommand,
  type FoodServingDto,
  type RecipeDto,
  type SearchRecipesQuery,
  type SetRecipeStatusCommand,
} from '@ajnutrition/shared';
import type { AuditLog } from '../ports/audit-log';
import type { FoodRepository } from '../ports/food-repository';
import type {
  FoodServingRepository,
  RecipeRepository,
  RecipeWithIngredientFoods,
} from '../ports/recipe-repository';
import type { UnitOfWork } from '../ports/unit-of-work';

export interface RecipeDeps {
  uow: UnitOfWork;
  recipes: RecipeRepository;
  foods: FoodRepository;
  servings: FoodServingRepository;
  audit: AuditLog;
  ctx: DomainContext;
}

function toDto(hydrated: RecipeWithIngredientFoods): RecipeDto {
  const totals = computeRecipeTotals(
    hydrated.ingredientFoods.map((ingredient) => ({
      grams: ingredient.grams,
      nutrients: ingredient.nutrients,
      basisGrams: ingredient.basisGrams,
    })),
  );
  const enrich = (list: typeof totals) =>
    list.map((total) => ({
      ...total,
      nameEs: NUTRIENTS[total.nutrientId]?.nameEs ?? total.nutrientId,
      unit: NUTRIENTS[total.nutrientId]?.unit ?? '',
    }));
  return {
    id: hydrated.recipe.id,
    status: hydrated.recipe.status,
    name: hydrated.recipe.name,
    description: hydrated.recipe.description,
    yieldPortions: hydrated.recipe.yieldPortions,
    instructions: hydrated.recipe.instructions,
    ingredients: hydrated.ingredientFoods.map((ingredient) => ({
      foodId: ingredient.foodId,
      foodName: ingredient.foodName,
      grams: ingredient.grams,
    })),
    totals: enrich(totals),
    perPortion: enrich(perPortion(totals, hydrated.recipe.yieldPortions)),
    createdAt: hydrated.recipe.createdAt,
  };
}

export class CreateRecipeUseCase {
  constructor(private readonly deps: RecipeDeps) {}

  execute(command: CreateRecipeCommand): RecipeDto {
    const { uow, recipes, foods, audit, ctx } = this.deps;
    return uow.run(() => {
      const ingredientFoods = command.ingredients.map((ingredient) => {
        const food = foods.findById(ingredient.foodId);
        if (food === null) {
          throw new AppError({
            code: 'NOT_FOUND',
            message: 'Uno de los ingredientes ya no existe en el catálogo.',
          });
        }
        return { food, grams: ingredient.grams };
      });

      const recipe = createRecipe(command, ctx);
      recipes.insert(recipe);
      audit.record({
        action: 'recipe.create',
        entityType: 'recipe',
        entityId: recipe.id,
        result: 'success',
        metadata: { name: recipe.name, ingredients: recipe.ingredients.length },
      });
      return toDto({
        recipe,
        ingredientFoods: ingredientFoods.map(({ food, grams }, index) => ({
          foodId: food.id,
          foodName: food.name,
          grams,
          nutrients: { ...food.nutrients },
          basisGrams: food.basisGrams,
          displayOrder: index,
        })),
      });
    });
  }
}

export class UpdateRecipeUseCase {
  constructor(private readonly deps: RecipeDeps) {}

  execute(command: UpdateRecipeCommand): RecipeDto {
    const { uow, recipes, foods, audit, ctx } = this.deps;
    return uow.run(() => {
      const existing = recipes.findById(command.recipeId);
      if (existing === null || existing.status !== 'active') {
        throw new AppError({ code: 'NOT_FOUND', message: 'Receta no encontrada.' });
      }
      const ingredientFoods = command.ingredients.map((ingredient) => {
        const food = foods.findById(ingredient.foodId);
        if (food === null) {
          throw new AppError({
            code: 'NOT_FOUND',
            message: 'Uno de los ingredientes ya no existe en el catálogo.',
          });
        }
        return { food, grams: ingredient.grams };
      });

      // Same validation rules as creation; identity preserved.
      const validated = createRecipe(command, ctx);
      const updated = {
        ...validated,
        id: existing.id,
        status: existing.status,
        createdAt: existing.createdAt,
      };
      recipes.update(updated);
      audit.record({
        action: 'recipe.update',
        entityType: 'recipe',
        entityId: updated.id,
        result: 'success',
        metadata: { name: updated.name, ingredients: updated.ingredients.length },
      });
      return toDto({
        recipe: updated,
        ingredientFoods: ingredientFoods.map(({ food, grams }, index) => ({
          foodId: food.id,
          foodName: food.name,
          grams,
          nutrients: { ...food.nutrients },
          basisGrams: food.basisGrams,
          displayOrder: index,
        })),
      });
    });
  }
}

export class SearchRecipesUseCase {
  constructor(private readonly deps: Pick<RecipeDeps, 'recipes'>) {}

  execute(query: SearchRecipesQuery): RecipeDto[] {
    const normalized = query.search ? normalizeFoodName(query.search) : undefined;
    return this.deps.recipes.search(normalized, 100, query.includeArchived === true).map(toDto);
  }
}

export class AddFoodServingUseCase {
  constructor(
    private readonly deps: Pick<RecipeDeps, 'uow' | 'foods' | 'servings' | 'audit' | 'ctx'>,
  ) {}

  execute(command: AddFoodServingCommand): FoodServingDto {
    const { uow, foods, servings, audit, ctx } = this.deps;
    return uow.run(() => {
      if (foods.findById(command.foodId) === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Alimento no encontrado.' });
      }
      const serving = createFoodServing(command, ctx);
      servings.insert(serving);
      audit.record({
        action: 'food.serving-add',
        entityType: 'food',
        entityId: serving.foodId,
        result: 'success',
        metadata: { name: serving.name, grams: serving.grams },
      });
      return { id: serving.id, name: serving.name, grams: serving.grams };
    });
  }
}

/**
 * Removes a household measure (a typo like "1 pieza = 3000 g" would otherwise
 * be permanent). Plan items store grams, so nothing already planned changes.
 */
export class DeleteFoodServingUseCase {
  constructor(private readonly deps: Pick<RecipeDeps, 'uow' | 'servings' | 'audit' | 'ctx'>) {}

  execute(command: DeleteFoodServingCommand): void {
    const { uow, servings, audit } = this.deps;
    uow.run(() => {
      const serving = servings.findById(command.servingId);
      if (serving === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Medida no encontrada.' });
      }
      servings.deleteById(serving.id);
      audit.record({
        action: 'food.serving-delete',
        entityType: 'food',
        entityId: serving.foodId,
        result: 'success',
        metadata: { name: serving.name, grams: serving.grams },
      });
    });
  }
}

/** Same contract as foods: hidden from pickers, still resolvable from plans. */
export class SetRecipeStatusUseCase {
  constructor(private readonly deps: RecipeDeps) {}

  execute(command: SetRecipeStatusCommand): RecipeDto {
    const { uow, recipes, audit, ctx } = this.deps;
    return uow.run(() => {
      const existing = recipes.findById(command.recipeId);
      if (existing === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Receta no encontrada.' });
      }
      const updated = setRecipeStatus(existing, command.status, ctx);
      recipes.setStatus(updated.id, updated.status, updated.updatedAt);
      audit.record({
        action: command.status === 'archived' ? 'recipe.archive' : 'recipe.restore',
        entityType: 'recipe',
        entityId: existing.id,
        result: 'success',
        metadata: { name: existing.name },
      });
      // Re-read so the DTO carries the hydrated ingredient foods.
      const [hydrated] = recipes
        .search(normalizeFoodName(existing.name), 100, true)
        .filter((candidate) => candidate.recipe.id === existing.id);
      if (hydrated === undefined) {
        throw new AppError({ code: 'UNEXPECTED', message: 'No fue posible releer la receta.' });
      }
      return toDto(hydrated);
    });
  }
}
