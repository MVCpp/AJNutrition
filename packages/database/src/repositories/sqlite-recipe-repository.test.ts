import { beforeEach, describe, expect, it } from 'vitest';
import type { DomainContext } from '@ajnutrition/domain';
import {
  AddFoodServingUseCase,
  DeleteFoodServingUseCase,
  ImportEquivalencesCsvUseCase,
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

  it('deletes a mistyped measure without touching the food', () => {
    const tortilla = createTortilla();
    const serving = new AddFoodServingUseCase(recipeDeps).execute({
      foodId: tortilla.id,
      name: '1 pizza',
      grams: 3000,
    });

    new DeleteFoodServingUseCase(recipeDeps).execute({ servingId: serving.id });

    const foods = new SearchFoodsUseCase(foodDeps).execute({ search: 'tortilla' });
    expect(foods).toHaveLength(1);
    expect(foods[0]?.servings).toEqual([]);
    const audit = db
      .prepare(`SELECT entity_id FROM audit_events WHERE action = 'food.serving-delete'`)
      .get() as { entity_id: string };
    expect(audit.entity_id).toBe(tortilla.id);
  });

  it('rejects deleting a measure that does not exist', () => {
    expect(() =>
      new DeleteFoodServingUseCase(recipeDeps).execute({
        servingId: '00000000-0000-4000-8000-0000000000fe',
      }),
    ).toThrowError();
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

describe('SMAE equivalences CSV import', () => {
  const csv = (body: string) => `alimento,grupo,gramos\n${body}`;

  it('imports by exact name, accepting the group id or its printed label', () => {
    createTortilla();
    new CreateFoodUseCase(foodDeps).execute({
      name: 'Manzana',
      energyKcal: 52,
      proteinG: 0.3,
      carbohydrateG: 14,
      fatG: 0.2,
    });

    const result = new ImportEquivalencesCsvUseCase(foodDeps).execute({
      content: csv('Tortilla de maiz,cereales_sin_grasa,30\nManzana,Frutas,120\n'),
    });

    expect(result).toMatchObject({ imported: 2, skippedTotal: 0 });
    const foods = new SearchFoodsUseCase(foodDeps).execute({});
    expect(foods.find((f) => f.name === 'Tortilla de maíz')?.equivalences).toEqual([
      { groupId: 'cereales_sin_grasa', gramsPerEquivalent: 30 },
    ]);
    expect(foods.find((f) => f.name === 'Manzana')?.equivalences).toEqual([
      { groupId: 'frutas', gramsPerEquivalent: 120 },
    ]);
  });

  it('reports rather than guesses: unknown food, unknown group, bad grams', () => {
    createTortilla();
    const result = new ImportEquivalencesCsvUseCase(foodDeps).execute({
      content: csv(
        'Pan de nube,frutas,30\nTortilla de maiz,grupo_inventado,30\nTortilla de maiz,frutas,0\n',
      ),
    });

    expect(result.imported).toBe(0);
    expect(result.skippedTotal).toBe(3);
    expect(result.skipped.map((row) => row.line)).toEqual([2, 3, 4]);
  });

  it('refuses an ambiguous name instead of attaching it to the wrong food', () => {
    createTortilla();
    createTortilla();
    const result = new ImportEquivalencesCsvUseCase(foodDeps).execute({
      content: csv('Tortilla de maiz,cereales_sin_grasa,30\n'),
    });
    // A near-match here would misstate every plan that uses the food.
    expect(result.imported).toBe(0);
    expect(result.skipped[0]?.reason).toContain('2 alimentos');
  });
});
