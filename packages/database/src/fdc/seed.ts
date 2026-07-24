import { normalizeFoodName } from '@ajnutrition/domain';
import type { SqliteDatabase } from '../connection';
import { FDC_CATALOG } from './catalog';

/**
 * Seeds the bundled USDA FDC catalog into the foods table. Idempotent:
 * fdc_id (unique) marks catalog rows, so re-running after unlock — or after
 * a future release adds foods — only inserts what is missing. Existing rows
 * are never touched: a repeat seed cannot overwrite anything.
 */
export function seedFdcCatalog(db: SqliteDatabase, ctx: { now(): Date; newId(): string }): number {
  const existing = new Set(
    (
      db.prepare('SELECT fdc_id AS id FROM foods WHERE fdc_id IS NOT NULL').all() as Array<{
        id: number;
      }>
    ).map((row) => row.id),
  );
  const missing = FDC_CATALOG.filter((food) => !existing.has(food.fdcId));
  if (missing.length === 0) return 0;

  const insertFood = db.prepare(
    `INSERT INTO foods (id, name, name_normalized, brand, category, source, status, fdc_id, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, 'fdc', 'active', ?, ?, ?)`,
  );
  const insertValue = db.prepare(
    `INSERT INTO food_nutrient_values (food_id, nutrient_id, amount, basis_grams)
     VALUES (?, ?, ?, 100)`,
  );
  const insertAllergen = db.prepare(
    `INSERT INTO food_allergens (food_id, allergen_id) VALUES (?, ?)`,
  );
  const run = db.transaction(() => {
    for (const food of missing) {
      const id = ctx.newId();
      const nowIso = ctx.now().toISOString();
      insertFood.run(
        id,
        food.name,
        normalizeFoodName(food.name),
        food.category,
        food.fdcId,
        nowIso,
        nowIso,
      );
      insertValue.run(id, 'energy_kcal', food.energyKcal);
      insertValue.run(id, 'protein_g', food.proteinG);
      insertValue.run(id, 'carbohydrate_g', food.carbohydrateG);
      insertValue.run(id, 'fat_g', food.fatG);
      if (food.fiberG !== undefined) insertValue.run(id, 'fiber_g', food.fiberG);
      if (food.sodiumMg !== undefined) insertValue.run(id, 'sodium_mg', food.sodiumMg);
      for (const allergenId of food.allergens ?? []) insertAllergen.run(id, allergenId);
    }
  });
  run();
  return missing.length;
}
