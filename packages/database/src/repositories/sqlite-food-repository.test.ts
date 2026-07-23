import { beforeEach, describe, expect, it } from 'vitest';
import type { DomainContext } from '@ajnutrition/domain';
import { CreateFoodUseCase, SearchFoodsUseCase, type FoodDeps } from '@ajnutrition/application';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqliteFoodRepository } from './sqlite-food-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';

let db: SqliteDatabase;
let deps: FoodDeps;
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
  deps = {
    uow: new SqliteUnitOfWork(db),
    foods: new SqliteFoodRepository(db),
    audit: new SqliteAuditLog(db, { appVersion: '0.1.0-test', now: ctx.now, newId: ctx.newId }),
    ctx,
  };
});

const tortilla = {
  name: 'Tortilla de maíz',
  energyKcal: 218,
  proteinG: 5.7,
  carbohydrateG: 44.6,
  fatG: 2.9,
  fiberG: 6.3,
};

describe('foods against real SQLite', () => {
  it('creates a custom food and stores every nutrient with explicit basis', () => {
    const dto = new CreateFoodUseCase(deps).execute(tortilla);
    expect(dto).toMatchObject({ name: 'Tortilla de maíz', source: 'custom', basisGrams: 100 });
    expect(dto.warnings).toHaveLength(0);

    const rows = db
      .prepare(
        'SELECT nutrient_id, amount, basis_grams FROM food_nutrient_values ORDER BY nutrient_id',
      )
      .all() as Array<{ nutrient_id: string; amount: number; basis_grams: number }>;
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.basis_grams === 100)).toBe(true);
  });

  it('search is accent- and case-insensitive', () => {
    new CreateFoodUseCase(deps).execute(tortilla);
    new CreateFoodUseCase(deps).execute({
      name: 'Plátano macho',
      energyKcal: 122,
      proteinG: 1.3,
      carbohydrateG: 31.9,
      fatG: 0.4,
    });

    const searchUseCase = new SearchFoodsUseCase({ foods: deps.foods });
    expect(searchUseCase.execute({ search: 'MAIZ' })).toHaveLength(1);
    expect(searchUseCase.execute({ search: 'maíz' })).toHaveLength(1);
    expect(searchUseCase.execute({ search: 'platano' })).toHaveLength(1);
    expect(searchUseCase.execute({ search: 'pollo' })).toHaveLength(0);
    expect(searchUseCase.execute({})).toHaveLength(2);
  });

  it('flags an energy/macro mismatch as a warning without rejecting', () => {
    const dto = new CreateFoodUseCase(deps).execute({
      name: 'Alimento con error de captura',
      energyKcal: 100,
      proteinG: 0,
      carbohydrateG: 0,
      fatG: 100, // Atwater says 900 kcal — likely a typo, flagged not blocked.
    });
    expect(dto.warnings).toContain('energy_macro_mismatch');
  });

  it('escapes LIKE wildcards in search input', () => {
    new CreateFoodUseCase(deps).execute(tortilla);
    expect(new SearchFoodsUseCase({ foods: deps.foods }).execute({ search: '%' })).toHaveLength(0);
  });

  it('audits food creation with the food name (reference data, not patient data)', () => {
    new CreateFoodUseCase(deps).execute(tortilla);
    const row = db
      .prepare(`SELECT metadata_json FROM audit_events WHERE action = 'food.create'`)
      .get() as { metadata_json: string };
    expect(JSON.parse(row.metadata_json)).toEqual({ name: 'Tortilla de maíz', source: 'custom' });
  });
});
