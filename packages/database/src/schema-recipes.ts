import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { foods } from './schema-foods';

/** Mirrors migration 0008 — migrations.ts remains the physical source of truth. */

export const foodServings = sqliteTable(
  'food_servings',
  {
    id: text('id').primaryKey(),
    foodId: text('food_id')
      .notNull()
      .references(() => foods.id),
    name: text('name').notNull(),
    grams: real('grams').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_servings_food').on(table.foodId)],
);

export const recipes = sqliteTable(
  'recipes',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    description: text('description'),
    yieldPortions: real('yield_portions').notNull(),
    instructions: text('instructions'),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_recipes_normalized').on(table.nameNormalized)],
);

export const recipeIngredients = sqliteTable(
  'recipe_ingredients',
  {
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id),
    foodId: text('food_id')
      .notNull()
      .references(() => foods.id),
    grams: real('grams').notNull(),
    displayOrder: integer('display_order').notNull(),
  },
  (table) => [primaryKey({ columns: [table.recipeId, table.foodId] })],
);
