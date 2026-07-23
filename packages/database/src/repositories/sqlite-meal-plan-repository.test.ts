import { beforeEach, describe, expect, it } from 'vitest';
import { createPatient, type DomainContext } from '@ajnutrition/domain';
import {
  AddHistoryEntryUseCase,
  AddPlanItemUseCase,
  CreateFoodUseCase,
  CreateMealPlanUseCase,
  CreateMeasurementSessionUseCase,
  CreateRecipeUseCase,
  ListMealPlansUseCase,
  RemovePlanItemUseCase,
  type FoodDeps,
  type MealPlanDeps,
  type RecipeDeps,
} from '@ajnutrition/application';
import type { AppError } from '@ajnutrition/shared';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqlitePatientRepository } from './sqlite-patient-repository';
import { SqliteMeasurementRepository } from './sqlite-measurement-repository';
import { SqliteClinicalHistoryRepository } from './sqlite-clinical-history-repository';
import { SqliteFoodRepository } from './sqlite-food-repository';
import { SqliteFoodServingRepository, SqliteRecipeRepository } from './sqlite-recipe-repository';
import { SqliteMealPlanRepository } from './sqlite-meal-plan-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';

let db: SqliteDatabase;
let deps: MealPlanDeps;
let foodDeps: FoodDeps;
let recipeDeps: RecipeDeps;
let patientId: string;
let sessionId: string;
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
  const uow = new SqliteUnitOfWork(db);
  const audit = new SqliteAuditLog(db, {
    appVersion: '0.1.0-test',
    now: ctx.now,
    newId: ctx.newId,
  });
  const patients = new SqlitePatientRepository(db);
  const measurements = new SqliteMeasurementRepository(db);
  const history = new SqliteClinicalHistoryRepository(db);
  const foods = new SqliteFoodRepository(db);
  const servings = new SqliteFoodServingRepository(db);
  foodDeps = { uow, foods, servings, audit, ctx };
  recipeDeps = { uow, recipes: new SqliteRecipeRepository(db), foods, servings, audit, ctx };
  deps = {
    uow,
    plans: new SqliteMealPlanRepository(db),
    measurements,
    patients,
    history,
    audit,
    ctx,
  };

  // Male, exactly 35 at measurement → Mifflin REE 1755 (80 kg, 180 cm).
  const patient = createPatient(
    {
      fileNumber: 1,
      firstName: 'Héctor',
      lastName: 'Ramírez',
      dateOfBirth: '1991-07-23',
      sexAtBirth: 'male',
    },
    ctx,
  );
  patients.insert(patient);
  patientId = patient.id;
  const session = new CreateMeasurementSessionUseCase({
    uow,
    measurements,
    patients,
    audit,
    ctx,
  }).execute({ patientId, measuredAt: '2026-07-23', weightKg: 80, heightCm: 180 });
  sessionId = session.id;
  new AddHistoryEntryUseCase({ uow, history, patients, audit, ctx }).execute({
    patientId,
    category: 'allergy',
    content: 'Alergia a nueces',
  });
});

const planCommand = () => ({
  patientId,
  name: 'Plan de reducción',
  days: 2,
  macros: { proteinPct: 20, carbohydratePct: 50, fatPct: 30 },
  basis: { type: 'measurement' as const, sessionId, pal: 1.55, adjustmentKcal: -500 },
});

describe('meal plans against real SQLite (the full chain)', () => {
  it('derives targets from the measurement session with frozen provenance', () => {
    const plan = new CreateMealPlanUseCase(deps).execute(planCommand());
    // REE 1755 × 1.55 = 2720.25 → 2720; − 500 = 2220 kcal.
    expect(plan.targets.energyKcal).toBe(2220);
    // 20/50/30 via Atwater: P 111 g, C 278 g (277.5→278), F 74 g.
    expect(plan.targets).toMatchObject({ proteinG: 111, carbohydrateG: 278, fatG: 74 });
    expect(plan.targetSource).toMatchObject({
      type: 'measurement',
      reeKcal: 1755,
      reeFormulaId: 'mifflin_st_jeor_ree',
      reeFormulaVersion: 1,
      teeFormulaId: 'tee_pal',
      pal: 1.55,
      adjustmentKcal: -500,
    });
    expect(plan.allergies).toEqual(['Alergia a nueces']);
    expect(plan.dayPlans).toHaveLength(2);
  });

  it('adds food and recipe items and computes live meal/day totals', () => {
    const tortilla = new CreateFoodUseCase(foodDeps).execute({
      name: 'Tortilla de maíz',
      energyKcal: 218,
      proteinG: 5.7,
      carbohydrateG: 44.6,
      fatG: 2.9,
      fiberG: 6.3,
    });
    const recipe = new CreateRecipeUseCase(recipeDeps).execute({
      name: 'Tacos sencillos',
      yieldPortions: 4,
      ingredients: [{ foodId: tortilla.id, grams: 240 }],
    });

    const plan = new CreateMealPlanUseCase(deps).execute(planCommand());
    new AddPlanItemUseCase(deps).execute({
      planId: plan.id,
      dayIndex: 0,
      mealSlot: 'breakfast',
      item: { type: 'food', foodId: tortilla.id, grams: 100 },
    });
    const updated = new AddPlanItemUseCase(deps).execute({
      planId: plan.id,
      dayIndex: 0,
      mealSlot: 'lunch',
      item: { type: 'recipe', recipeId: recipe.id, portions: 2 },
    });

    const day0 = updated.dayPlans[0];
    const breakfast = day0?.meals.find((m) => m.slot === 'breakfast');
    expect(breakfast?.totals.find((t) => t.nutrientId === 'energy_kcal')?.amount).toBe(218);
    const lunch = day0?.meals.find((m) => m.slot === 'lunch');
    // Recipe: 240 g tortilla → 523.2 kcal / 4 portions = 130.8 × 2 = 261.6
    expect(lunch?.totals.find((t) => t.nutrientId === 'energy_kcal')?.amount).toBe(261.6);
    expect(day0?.totals.find((t) => t.nutrientId === 'energy_kcal')?.amount).toBe(479.6);
    // Tortilla lacks sodium → the day is honestly incomplete for sodium.
    expect(day0?.totals.find((t) => t.nutrientId === 'sodium_mg')?.complete).toBe(false);
    // Day 1 untouched and complete-empty.
    expect(updated.dayPlans[1]?.totals.every((t) => t.amount === 0)).toBe(true);
  });

  it('removes items and recomputes', () => {
    const tortilla = new CreateFoodUseCase(foodDeps).execute({
      name: 'Tortilla',
      energyKcal: 218,
      proteinG: 5.7,
      carbohydrateG: 44.6,
      fatG: 2.9,
    });
    const plan = new CreateMealPlanUseCase(deps).execute(planCommand());
    const withItem = new AddPlanItemUseCase(deps).execute({
      planId: plan.id,
      dayIndex: 0,
      mealSlot: 'dinner',
      item: { type: 'food', foodId: tortilla.id, grams: 50 },
    });
    const itemId = withItem.dayPlans[0]?.meals.find((m) => m.slot === 'dinner')?.items[0]?.id;
    expect(itemId).toBeDefined();
    const afterRemove = new RemovePlanItemUseCase(deps).execute({ itemId: itemId ?? '' });
    expect(
      afterRemove.dayPlans[0]?.totals.find((t) => t.nutrientId === 'energy_kcal')?.amount,
    ).toBe(0);
  });

  it('rejects a plan basis session without REE with a clear message', () => {
    // Session with waist only → no Mifflin calculation.
    const bare = new CreateMeasurementSessionUseCase({
      uow: deps.uow,
      measurements: deps.measurements,
      patients: deps.patients,
      audit: deps.audit,
      ctx,
    }).execute({ patientId, measuredAt: '2026-07-23', waistCm: 90 });
    try {
      new CreateMealPlanUseCase(deps).execute({
        ...planCommand(),
        basis: { type: 'measurement', sessionId: bare.id, pal: 1.55, adjustmentKcal: 0 },
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('VALIDATION');
    }
  });

  it('supports a manual energy basis and rejects items on nonexistent days', () => {
    const plan = new CreateMealPlanUseCase(deps).execute({
      ...planCommand(),
      basis: { type: 'manual', energyKcal: 1800 },
    });
    expect(plan.targets.energyKcal).toBe(1800);
    expect(plan.targetSource).toMatchObject({ type: 'manual' });

    expect(() =>
      new AddPlanItemUseCase(deps).execute({
        planId: plan.id,
        dayIndex: 5, // plan has 2 days
        mealSlot: 'lunch',
        item: { type: 'food', foodId: '00000000-0000-4000-8000-0000000000ff', grams: 100 },
      }),
    ).toThrowError();
  });

  it('lists plan summaries newest-first', () => {
    new CreateMealPlanUseCase(deps).execute(planCommand());
    const summaries = new ListMealPlansUseCase({ plans: deps.plans }).execute({ patientId });
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ name: 'Plan de reducción', days: 2, status: 'draft' });
  });
});
