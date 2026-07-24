import { beforeEach, describe, expect, it } from 'vitest';
import type { DomainContext } from '@ajnutrition/domain';
import {
  AddFoodServingUseCase,
  CreateFoodUseCase,
  CreateRecipeUseCase,
  UpdateRecipeUseCase,
  SearchFoodsUseCase,
  SearchRecipesUseCase,
  type FoodDeps,
  type RecipeDeps,
} from '@ajnutrition/application';
import type { AppError } from '@ajnutrition/shared';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqliteFoodRepository } from './sqlite-food-repository';
import { SqliteFoodServingRepository, SqliteRecipeRepository } from './sqlite-recipe-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';

let db: SqliteDatabase;
let foodDeps: FoodDeps;
let recipeDeps: RecipeDeps;
let idCounter = 0;

const ctx: DomainContext = {
  now: () => new Date('2026-07-23T12:00:00.000Z'),
  newId: () => {
    idCounter += 1;
    return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`;
  },
};

beforeEach(() => {
  idCounter = 0;
  db = openInMemoryDatabase();
  runMigrations(db);
  const uow = new SqliteUnitOfWork(db);
  const audit = new SqliteAuditLog(db, {
    appVersion: '0.1.0-test',
    now: ctx.now,
    newId: ctx.newId,
  });
  const foods = new SqliteFoodRepository(db);
  const servings = new SqliteFoodServingRepository(db);
  foodDeps = { uow, foods, servings, audit, ctx };
  recipeDeps = { uow, recipes: new SqliteRecipeRepository(db), foods, servings, audit, ctx };
});

function createTortilla() {
  return new CreateFoodUseCase(foodDeps).execute({
    name: 'Tortilla de maíz',
    energyKcal: 218,
    proteinG: 5.7,
    carbohydrateG: 44.6,
    fatG: 2.9,
    fiberG: 6.3,
  });
}

function createQueso() {
  // No fiber value on purpose: exercises missing ≠ zero in recipe totals.
  return new CreateFoodUseCase(foodDeps).execute({
    name: 'Queso Oaxaca',
    energyKcal: 300,
    proteinG: 22,
    carbohydrateG: 2,
    fatG: 23,
  });
}

describe('recipes against real SQLite', () => {
  it('creates a recipe and computes totals + per portion with completeness', () => {
    const tortilla = createTortilla();
    const queso = createQueso();
    const dto = new CreateRecipeUseCase(recipeDeps).execute({
      name: 'Quesadillas sencillas',
      yieldPortions: 2,
      ingredients: [
        { foodId: tortilla.id, grams: 60 },
        { foodId: queso.id, grams: 30 },
      ],
    });

    const energy = dto.totals.find((t) => t.nutrientId === 'energy_kcal');
    expect(energy).toMatchObject({ amount: 220.8, complete: true });
    const fiber = dto.totals.find((t) => t.nutrientId === 'fiber_g');
    expect(fiber).toMatchObject({ complete: false });
    const perPortionEnergy = dto.perPortion.find((t) => t.nutrientId === 'energy_kcal');
    expect(perPortionEnergy?.amount).toBe(110.4);
    expect(dto.ingredients.map((i) => i.foodName)).toEqual(['Tortilla de maíz', 'Queso Oaxaca']);
  });

  it('updates a recipe in place, replacing metadata and ingredients', () => {
    const tortilla = createTortilla();
    const queso = createQueso();
    const created = new CreateRecipeUseCase(recipeDeps).execute({
      name: 'Quesadillas sencillas',
      yieldPortions: 2,
      ingredients: [{ foodId: tortilla.id, grams: 60 }],
    });

    const updated = new UpdateRecipeUseCase(recipeDeps).execute({
      recipeId: created.id,
      name: 'Quesadillas con queso',
      description: 'Versión con más queso.',
      yieldPortions: 4,
      ingredients: [
        { foodId: tortilla.id, grams: 120 },
        { foodId: queso.id, grams: 60 },
      ],
    });
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Quesadillas con queso');
    expect(updated.yieldPortions).toBe(4);
    expect(updated.ingredients).toHaveLength(2);
    expect(updated.createdAt).toBe(created.createdAt);
    // Totals recomputed from the new ingredient list.
    const energy = updated.totals.find((t) => t.nutrientId === 'energy_kcal');
    expect(energy?.amount).toBeGreaterThan(0);

    const count = db.prepare('SELECT COUNT(*) AS n FROM recipes').get() as { n: number };
    expect(count.n).toBe(1);
    const ingredientCount = db
      .prepare('SELECT COUNT(*) AS n FROM recipe_ingredients WHERE recipe_id = ?')
      .get(created.id) as { n: number };
    expect(ingredientCount.n).toBe(2);

    expect(() =>
      new UpdateRecipeUseCase(recipeDeps).execute({
        recipeId: '00000000-0000-4000-8000-0000000000ff',
        name: 'Nada',
        yieldPortions: 1,
        ingredients: [{ foodId: tortilla.id, grams: 10 }],
      }),
    ).toThrowError();
  });

  it('search rehydrates recipes with current food data, accent-insensitive', () => {
    const tortilla = createTortilla();
    new CreateRecipeUseCase(recipeDeps).execute({
      name: 'Tacos de prueba',
      yieldPortions: 1,
      ingredients: [{ foodId: tortilla.id, grams: 120 }],
    });

    const found = new SearchRecipesUseCase({ recipes: recipeDeps.recipes }).execute({
      search: 'TÁCOS',
    });
    expect(found).toHaveLength(1);
    expect(found[0]?.totals.find((t) => t.nutrientId === 'energy_kcal')?.amount).toBe(261.6);
  });

  it('rejects a recipe referencing a nonexistent food and stores nothing', () => {
    try {
      new CreateRecipeUseCase(recipeDeps).execute({
        name: 'Receta rota',
        yieldPortions: 1,
        ingredients: [{ foodId: '00000000-0000-4000-8000-0000000000ff', grams: 100 }],
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('NOT_FOUND');
    }
    const count = db.prepare('SELECT COUNT(*) AS n FROM recipes').get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('rejects duplicate foods within one recipe', () => {
    const tortilla = createTortilla();
    expect(() =>
      new CreateRecipeUseCase(recipeDeps).execute({
        name: 'Doble tortilla',
        yieldPortions: 1,
        ingredients: [
          { foodId: tortilla.id, grams: 60 },
          { foodId: tortilla.id, grams: 30 },
        ],
      }),
    ).toThrowError();
  });
});

describe('household servings against real SQLite', () => {
  it('adds servings to a food and returns them in food search results', () => {
    const tortilla = createTortilla();
    new AddFoodServingUseCase(recipeDeps).execute({
      foodId: tortilla.id,
      name: '1 pieza',
      grams: 30,
    });

    const foods = new SearchFoodsUseCase(foodDeps).execute({ search: 'tortilla' });
    expect(foods[0]?.servings).toEqual([{ id: expect.any(String), name: '1 pieza', grams: 30 }]);
  });

  it('rejects servings for nonexistent foods', () => {
    expect(() =>
      new AddFoodServingUseCase(recipeDeps).execute({
        foodId: '00000000-0000-4000-8000-0000000000ff',
        name: '1 taza',
        grams: 240,
      }),
    ).toThrowError();
  });
});
