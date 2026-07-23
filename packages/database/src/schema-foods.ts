import { index, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Mirrors migration 0007 — migrations.ts remains the physical source of truth. */

export const foods = sqliteTable(
  'foods',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    brand: text('brand'),
    category: text('category'),
    source: text('source', { enum: ['custom', 'fdc', 'import'] })
      .notNull()
      .default('custom'),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_foods_normalized').on(table.nameNormalized)],
);

export const foodNutrientValues = sqliteTable(
  'food_nutrient_values',
  {
    foodId: text('food_id')
      .notNull()
      .references(() => foods.id),
    nutrientId: text('nutrient_id').notNull(),
    amount: real('amount').notNull(),
    basisGrams: real('basis_grams').notNull().default(100),
  },
  (table) => [primaryKey({ columns: [table.foodId, table.nutrientId] })],
);
