import { describe, expect, it, beforeEach } from 'vitest';
import type { DomainContext } from '@ajnutrition/domain';
import {
  SearchFoodsUseCase,
  SetFoodAllergensUseCase,
  UpdateFoodUseCase,
  type FoodDeps,
} from '@ajnutrition/application';
import { MIGRATIONS, runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqliteFoodRepository } from '../repositories/sqlite-food-repository';
import { SqliteFoodServingRepository } from '../repositories/sqlite-recipe-repository';
import { SqliteAuditLog } from '../repositories/sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';
import { seedFdcCatalog } from '../fdc/seed';
import { MX_CATALOG } from './catalog';
import { seedMxCatalog } from './seed';

let db: SqliteDatabase;
let deps: FoodDeps;
let idCounter = 0;

const ctx: DomainContext = {
  now: () => new Date('2026-07-25T12:00:00.000Z'),
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

describe('bundled CONABIO/INCMNSZ Mexican catalog', () => {
  it('seeds every bundled food exactly once (idempotent)', () => {
    expect(seedMxCatalog(db, ctx)).toBe(MX_CATALOG.length);
    expect(seedMxCatalog(db, ctx)).toBe(0);
    const count = db.prepare(`SELECT COUNT(*) AS n FROM foods WHERE source = 'mx'`).get() as {
      n: number;
    };
    expect(count.n).toBe(MX_CATALOG.length);
  });

  it('coexists with the USDA catalog (both seed fully)', () => {
    seedFdcCatalog(db, ctx);
    expect(seedMxCatalog(db, ctx)).toBe(MX_CATALOG.length);
    expect(seedMxCatalog(db, ctx)).toBe(0);
    expect(seedFdcCatalog(db, ctx)).toBe(0);
  });

  it('stores nutrient values verbatim per 100 g and finds foods via search', () => {
    seedMxCatalog(db, ctx);
    const tortilla = MX_CATALOG.find((f) => f.name === 'Maiz Tortilla');
    expect(tortilla).toBeDefined();

    const results = new SearchFoodsUseCase(deps).execute({ search: 'maiz tortilla' });
    const found = results.find((f) => f.name === tortilla?.name);
    expect(found).toBeDefined();
    expect(found?.source).toBe('mx');
    expect(found?.basisGrams).toBe(100);
    expect(found?.nutrients.find((n) => n.nutrientId === 'energy_kcal')?.amount).toBe(
      tortilla?.energyKcal,
    );
    expect(found?.nutrients.find((n) => n.nutrientId === 'protein_g')?.amount).toBe(
      tortilla?.proteinG,
    );
  });

  it('seeds inferred allergen tags and lets the practitioner retag catalog foods', () => {
    seedMxCatalog(db, ctx);
    const search = new SearchFoodsUseCase(deps);
    // Identity inference: Queso Oaxaca IS milk.
    const [queso] = search.execute({ search: 'queso oaxaca' });
    expect(queso).toBeDefined();
    expect(queso?.allergens).toContain('milk');

    const retagged = new SetFoodAllergensUseCase(deps).execute({
      foodId: queso?.id ?? '',
      allergens: ['milk', 'soy'],
    });
    expect(retagged.allergens.sort()).toEqual(['milk', 'soy']);
  });

  it('keeps catalog foods read-only', () => {
    seedMxCatalog(db, ctx);
    const [first] = new SearchFoodsUseCase(deps).execute({ search: 'maiz tortilla' });
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

  it('migration 20 rebuilds foods on a POPULATED v19 database without losing data or FTS', () => {
    // Simulate the real upgrade: a database at schema 19 with existing foods,
    // nutrient values, allergen tags and FTS rows, then apply migration 20.
    const oldDb = openInMemoryDatabase();
    runMigrations(
      oldDb,
      MIGRATIONS.filter((m) => m.id <= 19),
    );
    seedFdcCatalog(oldDb, ctx);
    oldDb
      .prepare(
        `INSERT INTO foods (id, name, name_normalized, source, status, created_at, updated_at)
         VALUES ('f-1', 'Tamal casero', 'tamal casero', 'custom', 'active', '2026-01-01', '2026-01-01')`,
      )
      .run();
    oldDb
      .prepare(
        `INSERT INTO food_nutrient_values (food_id, nutrient_id, amount, basis_grams)
         VALUES ('f-1', 'energy_kcal', 210, 100)`,
      )
      .run();
    oldDb
      .prepare(`INSERT INTO food_allergens (food_id, allergen_id) VALUES ('f-1', 'gluten')`)
      .run();

    runMigrations(oldDb); // applies 20 (foods rebuild) on populated data

    const oldDeps: FoodDeps = {
      ...deps,
      uow: new SqliteUnitOfWork(oldDb),
      foods: new SqliteFoodRepository(oldDb),
      servings: new SqliteFoodServingRepository(oldDb),
    };
    const tamal = new SearchFoodsUseCase(oldDeps)
      .execute({ search: 'tamal casero' })
      .find((f) => f.name === 'Tamal casero');
    expect(tamal?.name).toBe('Tamal casero');
    expect(tamal?.allergens).toEqual(['gluten']);
    expect(tamal?.nutrients.find((n) => n.nutrientId === 'energy_kcal')?.amount).toBe(210);

    // FTS triggers were recreated: newly seeded mx foods are searchable.
    expect(seedMxCatalog(oldDb, ctx)).toBe(MX_CATALOG.length);
    const [tortilla] = new SearchFoodsUseCase(oldDeps).execute({ search: 'maiz tortilla' });
    expect(tortilla).toBeDefined();
    const fk = oldDb.pragma('foreign_key_check') as unknown[];
    expect(fk).toHaveLength(0);
  });

  it('never bundles a food missing a core macro and keeps fiber as dietary fiber only', () => {
    for (const food of MX_CATALOG) {
      expect(food.energyKcal).toBeGreaterThanOrEqual(0);
      expect(food.proteinG).toBeGreaterThanOrEqual(0);
      expect(food.carbohydrateG).toBeGreaterThanOrEqual(0);
      expect(food.fatG).toBeGreaterThanOrEqual(0);
      if (food.fiberG !== undefined) expect(food.fiberG).toBeGreaterThanOrEqual(0);
      if (food.sodiumMg !== undefined) expect(food.sodiumMg).toBeGreaterThanOrEqual(0);
    }
    // conabio_id is unique across the bundle (idempotency key).
    const ids = new Set(MX_CATALOG.map((f) => f.conabioId));
    expect(ids.size).toBe(MX_CATALOG.length);
  });
});
