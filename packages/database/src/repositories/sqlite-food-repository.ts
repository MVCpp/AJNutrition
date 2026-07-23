import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Food } from '@ajnutrition/domain';
import type { FoodRepository } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';
import { foodNutrientValues, foods } from '../schema-foods';

export class SqliteFoodRepository implements FoodRepository {
  private readonly db: BetterSQLite3Database;

  constructor(connection: SqliteDatabase) {
    this.db = drizzle(connection);
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
  }

  findById(id: string): Food | null {
    const row = this.db.select().from(foods).where(eq(foods.id, id)).get();
    if (!row) return null;
    return this.hydrate([row])[0] ?? null;
  }

  search(searchNormalized: string | undefined, limit: number): Food[] {
    const filters = [eq(foods.status, 'active')];
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
    const values = this.db
      .select()
      .from(foodNutrientValues)
      .where(
        inArray(
          foodNutrientValues.foodId,
          rows.map((r) => r.id),
        ),
      )
      .all();
    const byFood = new Map<string, Record<string, number>>();
    for (const value of values) {
      const map = byFood.get(value.foodId) ?? {};
      map[value.nutrientId] = value.amount;
      byFood.set(value.foodId, map);
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
      basisGrams: 100,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }
}
