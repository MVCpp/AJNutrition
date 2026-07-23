import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './schema';
import { foods } from './schema-foods';
import { recipes } from './schema-recipes';

/** Mirrors migration 0009 — migrations.ts remains the physical source of truth. */

export const mealPlans = sqliteTable(
  'meal_plans',
  {
    id: text('id').primaryKey(),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    name: text('name').notNull(),
    days: integer('days').notNull(),
    status: text('status', { enum: ['draft', 'active', 'archived'] })
      .notNull()
      .default('draft'),
    energyTargetKcal: real('energy_target_kcal').notNull(),
    proteinTargetG: real('protein_target_g').notNull(),
    carbohydrateTargetG: real('carbohydrate_target_g').notNull(),
    fatTargetG: real('fat_target_g').notNull(),
    targetSourceJson: text('target_source_json').notNull(),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_plans_patient').on(table.patientId, table.createdAt)],
);

export const planItems = sqliteTable(
  'plan_items',
  {
    id: text('id').primaryKey(),
    planId: text('plan_id')
      .notNull()
      .references(() => mealPlans.id),
    dayIndex: integer('day_index').notNull(),
    mealSlot: text('meal_slot', {
      enum: ['breakfast', 'snack1', 'lunch', 'snack2', 'dinner'],
    }).notNull(),
    itemType: text('item_type', { enum: ['food', 'recipe'] }).notNull(),
    foodId: text('food_id').references(() => foods.id),
    recipeId: text('recipe_id').references(() => recipes.id),
    grams: real('grams'),
    portions: real('portions'),
    displayOrder: integer('display_order').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_plan_items_plan').on(
      table.planId,
      table.dayIndex,
      table.mealSlot,
      table.displayOrder,
    ),
  ],
);
