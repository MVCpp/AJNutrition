import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Food } from '@ajnutrition/domain';
import type { FoodRepository } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';
import { foodAllergens, foodNutrientValues, foods } from '../schema-foods';

export class SqliteFoodRepository implements FoodRepository {
  private readonly db: BetterSQLite3Database;
  private readonly connection: SqliteDatabase;

  constructor(connection: SqliteDatabase) {
    this.db = drizzle(connection);
    this.connection = connection;
  }

  insert(food: Food): void {
    this.db
      .insert(foods)
      .values({
        id: food.id,
        name: food.name,
        nameNormalized: food.nameNormalized,
        brand: food.brand,
        category: food.category,
        source: food.source,
        status: food.status,
        createdAt: food.createdAt,
        updatedAt: food.updatedAt,
      })
      .run();
    for (const [nutrientId, amount] of Object.entries(food.nutrients)) {
      this.db
        .insert(foodNutrientValues)
        .values({ foodId: food.id, nutrientId, amount, basisGrams: food.basisGrams })
        .run();
    }
    this.insertAllergens(food);
  }

  update(food: Food): void {
    this.db
      .update(foods)
      .set({
        name: food.name,
        nameNormalized: food.nameNormalized,
        brand: food.brand,
        category: food.category,
        updatedAt: food.updatedAt,
      })
      .where(eq(foods.id, food.id))
      .run();
    this.db.delete(foodNutrientValues).where(eq(foodNutrientValues.foodId, food.id)).run();
    for (const [nutrientId, amount] of Object.entries(food.nutrients)) {
      this.db
        .insert(foodNutrientValues)
        .values({ foodId: food.id, nutrientId, amount, basisGrams: food.basisGrams })
        .run();
    }
    this.db.delete(foodAllergens).where(eq(foodAllergens.foodId, food.id)).run();
    this.insertAllergens(food);
  }

  private insertAllergens(food: Food): void {
    for (const allergenId of food.allergens) {
      this.db.insert(foodAllergens).values({ foodId: food.id, allergenId }).run();
    }
  }

  setStatus(foodId: string, status: 'active' | 'archived', updatedAt: string): void {
    this.db.update(foods).set({ status, updatedAt }).where(eq(foods.id, foodId)).run();
  }

  setAllergens(foodId: string, allergens: readonly string[], updatedAt: string): void {
    this.db.delete(foodAllergens).where(eq(foodAllergens.foodId, foodId)).run();
    for (const allergenId of allergens) {
      this.db.insert(foodAllergens).values({ foodId, allergenId }).run();
    }
    this.db.update(foods).set({ updatedAt }).where(eq(foods.id, foodId)).run();
  }

  findById(id: string): Food | null {
    const row = this.db.select().from(foods).where(eq(foods.id, id)).get();
    if (!row) return null;
    return this.hydrate([row])[0] ?? null;
  }

  search(searchNormalized: string | undefined, limit: number, includeArchived = false): Food[] {
    // FTS5 word-prefix search first (fast over the bundled catalog); LIKE
    // substring scan as fallback so mid-word matches keep working.
    if (searchNormalized && searchNormalized.length > 0) {
      const match = searchNormalized
        .split(/\s+/)
        .map((token) => token.replace(/[^a-z0-9]/g, ''))
        .filter((token) => token.length > 0)
        .map((token) => `"${token}"*`)
        .join(' ');
      if (match.length > 0) {
        const ids = (
          this.connection
            .prepare(
              `SELECT f.id AS id FROM foods f JOIN foods_fts ft ON ft.rowid = f.rowid
               WHERE ft.name_normalized MATCH ?${includeArchived ? '' : " AND f.status = 'active'"}
               ORDER BY f.name_normalized LIMIT ?`,
            )
            .all(match, limit) as Array<{ id: string }>
        ).map((row) => row.id);
        if (ids.length > 0) {
          const rows = this.db
            .select()
            .from(foods)
            .where(inArray(foods.id, ids))
            .orderBy(asc(foods.nameNormalized))
            .all();
          return this.hydrate(rows);
        }
      }
    }
    const filters: SQL[] = includeArchived ? [] : [eq(foods.status, 'active')];
    if (searchNormalized && searchNormalized.length > 0) {
      const escaped = searchNormalized.replace(/([%_\\])/g, '\\$1');
      filters.push(sql`${foods.nameNormalized} LIKE ${`%${escaped}%`} ESCAPE '\\'`);
    }
    const rows = this.db
      .select()
      .from(foods)
      .where(and(...filters))
      .orderBy(asc(foods.nameNormalized))
      .limit(limit)
      .all();
    return this.hydrate(rows);
  }

  private hydrate(rows: Array<typeof foods.$inferSelect>): Food[] {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const values = this.db
      .select()
      .from(foodNutrientValues)
      .where(inArray(foodNutrientValues.foodId, ids))
      .all();
    const byFood = new Map<string, Record<string, number>>();
    const basisByFood = new Map<string, number>();
    for (const value of values) {
      const map = byFood.get(value.foodId) ?? {};
      map[value.nutrientId] = value.amount;
      byFood.set(value.foodId, map);
      basisByFood.set(value.foodId, value.basisGrams);
    }
    const allergenRows = this.db
      .select()
      .from(foodAllergens)
      .where(inArray(foodAllergens.foodId, ids))
      .all();
    const allergensByFood = new Map<string, string[]>();
    for (const row of allergenRows) {
      const list = allergensByFood.get(row.foodId) ?? [];
      list.push(row.allergenId);
      allergensByFood.set(row.foodId, list);
    }
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      nameNormalized: row.nameNormalized,
      brand: row.brand,
      category: row.category,
      source: row.source,
      status: row.status,
      nutrients: byFood.get(row.id) ?? {},
      basisGrams: basisByFood.get(row.id) ?? 100,
      allergens: allergensByFood.get(row.id) ?? [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }
}
