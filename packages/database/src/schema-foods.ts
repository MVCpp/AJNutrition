import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Mirrors migration 0007 — migrations.ts remains the physical source of truth. */

export const foods = sqliteTable(
  'foods',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    brand: text('brand'),
    category: text('category'),
    source: text('source', { enum: ['custom', 'fdc', 'import', 'mx'] })
      .notNull()
      .default('custom'),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    /** USDA FoodData Central id for catalog foods; null for custom/imported. */
    fdcId: integer('fdc_id'),
    /** CONABIO/INCMNSZ id for Mexican catalog foods; null otherwise. */
    conabioId: integer('conabio_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_foods_normalized').on(table.nameNormalized)],
);

export const foodAllergens = sqliteTable(
  'food_allergens',
  {
    foodId: text('food_id')
      .notNull()
      .references(() => foods.id),
    allergenId: text('allergen_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.foodId, table.allergenId] })],
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

/** SMAE equivalences recorded by the practitioner (see packages/shared/equivalences.ts). */
export const foodEquivalences = sqliteTable(
  'food_equivalences',
  {
    foodId: text('food_id')
      .notNull()
      .references(() => foods.id),
    groupId: text('group_id').notNull(),
    gramsPerEquivalent: real('grams_per_equivalent').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.foodId, table.groupId] })],
);
