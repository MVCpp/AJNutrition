import { describe, expect, it, beforeEach } from 'vitest';
import type { DomainContext } from '@ajnutrition/domain';
import {
  SearchFoodsUseCase,
  SetFoodAllergensUseCase,
  UpdateFoodUseCase,
  type FoodDeps,
} from '@ajnutrition/application';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqliteFoodRepository } from '../repositories/sqlite-food-repository';
import { SqliteFoodServingRepository } from '../repositories/sqlite-recipe-repository';
import { SqliteAuditLog } from '../repositories/sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';
import { FDC_CATALOG } from './catalog';
import { seedFdcCatalog } from './seed';

let db: SqliteDatabase;
let deps: FoodDeps;
let idCounter = 0;

const ctx: DomainContext = {
  now: () => new Date('2026-07-24T12:00:00.000Z'),
  newId: () => {
    idCounter += 1;
    return `00000000-0000-4000-9000-${String(idCounter).padStart(12, '0')}`;
  },
};

beforeEach(() => {
  idCounter = 0;
  db = openInMemoryDatabase();
  runMigrations(db);
  deps = {
    uow: new SqliteUnitOfWork(db),
    foods: new SqliteFoodRepository(db),
    servings: new SqliteFoodServingRepository(db),
    audit: new SqliteAuditLog(db, { appVersion: '0.1.0-test', now: ctx.now, newId: ctx.newId }),
    ctx,
  };
});

describe('bundled USDA FDC catalog', () => {
  it('seeds every bundled food exactly once (idempotent)', () => {
    expect(seedFdcCatalog(db, ctx)).toBe(FDC_CATALOG.length);
    expect(seedFdcCatalog(db, ctx)).toBe(0);
    const count = db.prepare(`SELECT COUNT(*) AS n FROM foods WHERE source = 'fdc'`).get() as {
      n: number;
    };
    expect(count.n).toBe(FDC_CATALOG.length);
  });

  it('stores nutrient values verbatim per 100 g and finds foods via FTS prefix search', () => {
    seedFdcCatalog(db, ctx);
    const fuji = FDC_CATALOG.find((f) => f.nameEn === 'Apples, fuji, with skin, raw');
    expect(fuji).toBeDefined();

    const results = new SearchFoodsUseCase(deps).execute({ search: 'manzanas fuji' });
    const apple = results.find((f) => f.name === fuji?.name);
    expect(apple).toBeDefined();
    expect(apple?.source).toBe('fdc');
    expect(apple?.basisGrams).toBe(100);
    expect(apple?.nutrients.find((n) => n.nutrientId === 'energy_kcal')?.amount).toBe(
      fuji?.energyKcal,
    );
    expect(apple?.nutrients.find((n) => n.nutrientId === 'protein_g')?.amount).toBe(fuji?.proteinG);
  });

  it('falls back to substring search when no word starts with the query', () => {
    seedFdcCatalog(db, ctx);
    // 'anzanas' is mid-word in 'manzanas' — FTS prefix misses, LIKE catches.
    const results = new SearchFoodsUseCase(deps).execute({ search: 'anzanas' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((f) => f.name.toLowerCase().includes('manzanas'))).toBe(true);
  });

  it('seeds inferred allergen tags and lets the practitioner retag catalog foods', () => {
    seedFdcCatalog(db, ctx);
    const search = new SearchFoodsUseCase(deps);
    // Identity inference: cheddar IS milk.
    const [cheddar] = search.execute({ search: 'queso cheddar' });
    expect(cheddar).toBeDefined();
    expect(cheddar?.allergens).toContain('milk');

    // Tags stay editable even though the nutrient values are read-only.
    const retagged = new SetFoodAllergensUseCase(deps).execute({
      foodId: cheddar?.id ?? '',
      allergens: ['milk', 'soy'],
    });
    expect(retagged.allergens.sort()).toEqual(['milk', 'soy']);
    const [after] = search.execute({ search: 'queso cheddar' });
    expect(after?.allergens.sort()).toEqual(['milk', 'soy']);
  });

  it('keeps catalog foods read-only', () => {
    seedFdcCatalog(db, ctx);
    const [first] = new SearchFoodsUseCase(deps).execute({ search: 'manzanas fuji' });
    expect(first).toBeDefined();
    expect(() =>
      new UpdateFoodUseCase(deps).execute({
        foodId: first?.id ?? '',
        name: 'Hackeada',
        energyKcal: 1,
        proteinG: 0,
        carbohydrateG: 0,
        fatG: 0,
      }),
    ).toThrowError('solo lectura');
  });
});
