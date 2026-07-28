import { beforeEach, describe, expect, it } from 'vitest';
import { createPatient, type DomainContext } from '@ajnutrition/domain';
import {
  AddFoodServingUseCase,
  AddHistoryEntryUseCase,
  SearchFoodsUseCase,
  SearchRecipesUseCase,
  SetFoodStatusUseCase,
  SetRecipeStatusUseCase,
  AddPlanItemUseCase,
  DeleteFoodServingUseCase,
  GetMealPlanUseCase,
  CreateFoodUseCase,
  CreateMealPlanUseCase,
  CreateMeasurementSessionUseCase,
  CreateRecipeUseCase,
  CopyPlanDayUseCase,
  CreateConsultationUseCase,
  GenerateShoppingListUseCase,
  ListMealPlansUseCase,
  RemovePlanItemUseCase,
  ReplacePlanItemUseCase,
  SetPlanStatusUseCase,
  SuggestSubstitutesUseCase,
  type FoodDeps,
  type MealPlanDeps,
  type RecipeDeps,
} from '@ajnutrition/application';
import { AppError } from '@ajnutrition/shared';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqlitePatientRepository } from './sqlite-patient-repository';
import { SqliteMeasurementRepository } from './sqlite-measurement-repository';
import { SqliteClinicalHistoryRepository } from './sqlite-clinical-history-repository';
import { SqliteConsultationRepository } from './sqlite-consultation-repository';
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
    consultations: new SqliteConsultationRepository(db),
    foods,
    servings,
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
    consultations: new SqliteConsultationRepository(db),
    audit,
    ctx,
  }).execute({
    patientId,
    measuredAt: '2026-07-23',
    weightKg: 80,
    heightCm: 180,
    bodyFatPercent: 20,
  });
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
      consultations: deps.consultations,
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

  it('links a plan to a consultation of the same patient and rejects foreign ones', () => {
    const consultation = new CreateConsultationUseCase({
      uow: deps.uow,
      consultations: deps.consultations,
      patients: deps.patients,
      audit: deps.audit,
      ctx,
    }).execute({
      patientId,
      consultationDate: '2026-07-23',
      consultationType: 'initial',
      subjective: 'Primera consulta.',
    });

    const plan = new CreateMealPlanUseCase(deps).execute({
      ...planCommand(),
      consultationId: consultation.id,
    });
    expect(plan.consultationId).toBe(consultation.id);
    const summaries = new ListMealPlansUseCase({ plans: deps.plans }).execute({ patientId });
    expect(summaries[0]?.consultationId).toBe(consultation.id);

    try {
      new CreateMealPlanUseCase(deps).execute({
        ...planCommand(),
        consultationId: '00000000-0000-4000-8000-0000000000aa',
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('VALIDATION');
    }
  });

  it('walks the lifecycle and auto-archives the previous active plan', () => {
    const setStatus = new SetPlanStatusUseCase(deps);
    const first = new CreateMealPlanUseCase(deps).execute(planCommand());
    const second = new CreateMealPlanUseCase(deps).execute({
      ...planCommand(),
      name: 'Plan de mantenimiento',
    });

    expect(setStatus.execute({ planId: first.id, status: 'active' }).status).toBe('active');
    // Activating the second archives the first: one active plan per patient.
    expect(setStatus.execute({ planId: second.id, status: 'active' }).status).toBe('active');
    const summaries = new ListMealPlansUseCase({ plans: deps.plans }).execute({ patientId });
    expect(summaries.find((p) => p.id === first.id)?.status).toBe('archived');
    expect(summaries.find((p) => p.id === second.id)?.status).toBe('active');

    // Archived is terminal.
    try {
      setStatus.execute({ planId: first.id, status: 'active' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('VALIDATION');
    }
  });

  it('allows editing active plans but never archived ones', () => {
    const tortilla = new CreateFoodUseCase(foodDeps).execute({
      name: 'Tortilla',
      energyKcal: 218,
      proteinG: 5.7,
      carbohydrateG: 44.6,
      fatG: 2.9,
    });
    const plan = new CreateMealPlanUseCase(deps).execute(planCommand());
    new SetPlanStatusUseCase(deps).execute({ planId: plan.id, status: 'active' });

    // Active: still editable (solo practitioner adjusts the live plan).
    const withItem = new AddPlanItemUseCase(deps).execute({
      planId: plan.id,
      dayIndex: 0,
      mealSlot: 'lunch',
      item: { type: 'food', foodId: tortilla.id, grams: 50 },
    });
    const itemId = withItem.dayPlans[0]?.meals.find((m) => m.slot === 'lunch')?.items[0]?.id ?? '';
    expect(itemId).not.toBe('');

    // Archived: terminal and read-only.
    new SetPlanStatusUseCase(deps).execute({ planId: plan.id, status: 'archived' });
    expect(() =>
      new AddPlanItemUseCase(deps).execute({
        planId: plan.id,
        dayIndex: 0,
        mealSlot: 'dinner',
        item: { type: 'food', foodId: tortilla.id, grams: 50 },
      }),
    ).toThrowError('archivado');
    expect(() => new RemovePlanItemUseCase(deps).execute({ itemId })).toThrowError('archivado');
    expect(() =>
      new CopyPlanDayUseCase(deps).execute({ planId: plan.id, fromDayIndex: 0, toDayIndex: 1 }),
    ).toThrowError('archivado');
  });

  it('derives targets from an alternative REE formula when requested', () => {
    // Katch-McArdle: FFM 64 kg → 370 + 21.6·64 = 1752 kcal REE.
    const plan = new CreateMealPlanUseCase(deps).execute({
      ...planCommand(),
      basis: {
        type: 'measurement' as const,
        sessionId,
        reeFormulaId: 'katch_mcardle_ree' as const,
        pal: 1.55,
        adjustmentKcal: 0,
      },
    });
    // 1752 × 1.55 = 2715.6 → 2716
    expect(plan.targets.energyKcal).toBe(2716);
    expect(plan.targetSource).toMatchObject({ reeFormulaId: 'katch_mcardle_ree' });
  });

  it('rejects a formula the session did not compute', () => {
    // Session without body fat → Katch-McArdle absent.
    const bare = new CreateMeasurementSessionUseCase({
      uow: deps.uow,
      measurements: deps.measurements,
      patients: deps.patients,
      consultations: deps.consultations,
      audit: deps.audit,
      ctx,
    }).execute({ patientId, measuredAt: '2026-07-22', weightKg: 80, heightCm: 180 });
    try {
      new CreateMealPlanUseCase(deps).execute({
        ...planCommand(),
        basis: {
          type: 'measurement' as const,
          sessionId: bare.id,
          reeFormulaId: 'katch_mcardle_ree' as const,
          pal: 1.55,
          adjustmentKcal: 0,
        },
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('VALIDATION');
      expect((err as AppError).message).toContain('Katch-McArdle');
    }
  });

  it('aggregates a shopping list across days, expanding recipes by portions', () => {
    const tortilla = new CreateFoodUseCase(foodDeps).execute({
      name: 'Tortilla',
      energyKcal: 218,
      proteinG: 5.7,
      carbohydrateG: 44.6,
      fatG: 2.9,
    });
    const frijol = new CreateFoodUseCase(foodDeps).execute({
      name: 'Frijol negro cocido',
      energyKcal: 132,
      proteinG: 8.9,
      carbohydrateG: 23.7,
      fatG: 0.5,
    });
    const recipe = new CreateRecipeUseCase(recipeDeps).execute({
      name: 'Tacos de frijol',
      yieldPortions: 4,
      ingredients: [
        { foodId: tortilla.id, grams: 240 },
        { foodId: frijol.id, grams: 400 },
      ],
    });
    const plan = new CreateMealPlanUseCase(deps).execute(planCommand());
    new AddPlanItemUseCase(deps).execute({
      planId: plan.id,
      dayIndex: 0,
      mealSlot: 'breakfast',
      item: { type: 'food', foodId: tortilla.id, grams: 100 },
    });
    new AddPlanItemUseCase(deps).execute({
      planId: plan.id,
      dayIndex: 0,
      mealSlot: 'lunch',
      item: { type: 'recipe', recipeId: recipe.id, portions: 2 },
    });
    new AddPlanItemUseCase(deps).execute({
      planId: plan.id,
      dayIndex: 1,
      mealSlot: 'dinner',
      item: { type: 'food', foodId: frijol.id, grams: 150 },
    });

    const list = new GenerateShoppingListUseCase({ plans: deps.plans }).execute({
      planId: plan.id,
    });
    expect(list.days).toBe(2);
    // Frijol: 400·(2/4) + 150 = 350 g; Tortilla: 100 + 240·(2/4) = 220 g. Sorted es-locale.
    expect(list.items).toEqual([
      { foodId: frijol.id, foodName: 'Frijol negro cocido', brand: null, totalGrams: 350 },
      { foodId: tortilla.id, foodName: 'Tortilla', brand: null, totalGrams: 220 },
    ]);
  });

  it('hard-blocks foods and recipes carrying a structured patient allergen', () => {
    // The fixture's free-text 'Alergia a nueces' has no tag — it never blocks.
    new AddHistoryEntryUseCase({
      uow: deps.uow,
      history: deps.history,
      patients: deps.patients,
      audit: deps.audit,
      ctx,
    }).execute({
      patientId,
      category: 'allergy',
      content: 'Anafilaxia por cacahuate, confirmada 2024.',
      allergenId: 'peanut',
    });

    const crema = new CreateFoodUseCase(foodDeps).execute({
      name: 'Crema de cacahuate',
      energyKcal: 588,
      proteinG: 25,
      carbohydrateG: 20,
      fatG: 50,
      allergens: ['peanut'],
    });
    expect(crema.allergens).toEqual(['peanut']);
    const manzana = new CreateFoodUseCase(foodDeps).execute({
      name: 'Manzana',
      energyKcal: 52,
      proteinG: 0.3,
      carbohydrateG: 13.8,
      fatG: 0.2,
    });
    const recipe = new CreateRecipeUseCase(recipeDeps).execute({
      name: 'Licuado con cacahuate',
      yieldPortions: 2,
      ingredients: [
        { foodId: crema.id, grams: 40 },
        { foodId: manzana.id, grams: 150 },
      ],
    });

    const plan = new CreateMealPlanUseCase(deps).execute(planCommand());
    const addItem = new AddPlanItemUseCase(deps);

    try {
      addItem.execute({
        planId: plan.id,
        dayIndex: 0,
        mealSlot: 'breakfast',
        item: { type: 'food', foodId: crema.id, grams: 30 },
      });
      expect.unreachable('should have blocked the tagged food');
    } catch (err) {
      expect((err as AppError).code).toBe('VALIDATION');
      expect((err as AppError).message).toContain('Cacahuate');
    }

    // The recipe inherits its ingredients' allergens.
    expect(() =>
      addItem.execute({
        planId: plan.id,
        dayIndex: 0,
        mealSlot: 'lunch',
        item: { type: 'recipe', recipeId: recipe.id, portions: 1 },
      }),
    ).toThrowError('Cacahuate');

    // Untagged foods stay addable.
    const updated = addItem.execute({
      planId: plan.id,
      dayIndex: 0,
      mealSlot: 'snack1',
      item: { type: 'food', foodId: manzana.id, grams: 150 },
    });
    expect(updated.dayPlans[0]?.meals.find((m) => m.slot === 'snack1')?.items).toHaveLength(1);
  });

  it('suggests isoenergetic same-category substitutes, excluding blocked allergens', () => {
    new AddHistoryEntryUseCase({
      uow: deps.uow,
      history: deps.history,
      patients: deps.patients,
      audit: deps.audit,
      ctx,
    }).execute({
      patientId,
      category: 'allergy',
      content: 'Enfermedad celiaca.',
      allergenId: 'gluten',
    });

    const createFood = new CreateFoodUseCase(foodDeps);
    const tortilla = createFood.execute({
      name: 'Tortilla de maíz',
      category: 'Cereales',
      energyKcal: 218,
      proteinG: 5.7,
      carbohydrateG: 44.6,
      fatG: 2.9,
    });
    createFood.execute({
      name: 'Arroz cocido',
      category: 'Cereales',
      energyKcal: 130,
      proteinG: 2.7,
      carbohydrateG: 28.2,
      fatG: 0.3,
    });
    createFood.execute({
      name: 'Pan integral',
      category: 'Cereales',
      energyKcal: 250,
      proteinG: 12,
      carbohydrateG: 41,
      fatG: 4.2,
      allergens: ['gluten'],
    });
    createFood.execute({
      name: 'Manzana',
      category: 'Frutas',
      energyKcal: 52,
      proteinG: 0.3,
      carbohydrateG: 13.8,
      fatG: 0.2,
    });

    const plan = new CreateMealPlanUseCase(deps).execute(planCommand());
    const withItem = new AddPlanItemUseCase(deps).execute({
      planId: plan.id,
      dayIndex: 0,
      mealSlot: 'breakfast',
      item: { type: 'food', foodId: tortilla.id, grams: 100 },
    });
    const itemId =
      withItem.dayPlans[0]?.meals.find((m) => m.slot === 'breakfast')?.items[0]?.id ?? '';

    const result = new SuggestSubstitutesUseCase({
      plans: deps.plans,
      foods: foodDeps.foods,
      history: deps.history,
    }).execute({ itemId });

    expect(result.original).toMatchObject({ name: 'Tortilla de maíz', grams: 100 });
    // Same category only; the gluten-tagged bread never appears for this patient.
    expect(result.suggestions.map((s) => s.name)).toEqual(['Arroz cocido']);
    // Isoenergetic: 218 kcal ÷ 1.30 kcal/g = 167.7 g → rounded to 5 g steps.
    expect(result.suggestions[0]).toMatchObject({ grams: 170, energyKcal: 221 });
  });

  it('replaces a food item in place and enforces the allergen block', () => {
    new AddHistoryEntryUseCase({
      uow: deps.uow,
      history: deps.history,
      patients: deps.patients,
      audit: deps.audit,
      ctx,
    }).execute({
      patientId,
      category: 'allergy',
      content: 'Enfermedad celiaca.',
      allergenId: 'gluten',
    });
    const createFood = new CreateFoodUseCase(foodDeps);
    const tortilla = createFood.execute({
      name: 'Tortilla',
      energyKcal: 218,
      proteinG: 5.7,
      carbohydrateG: 44.6,
      fatG: 2.9,
    });
    const arroz = createFood.execute({
      name: 'Arroz cocido',
      energyKcal: 130,
      proteinG: 2.7,
      carbohydrateG: 28.2,
      fatG: 0.3,
    });
    const pan = createFood.execute({
      name: 'Pan integral',
      energyKcal: 250,
      proteinG: 12,
      carbohydrateG: 41,
      fatG: 4.2,
      allergens: ['gluten'],
    });

    const plan = new CreateMealPlanUseCase(deps).execute(planCommand());
    const withItem = new AddPlanItemUseCase(deps).execute({
      planId: plan.id,
      dayIndex: 0,
      mealSlot: 'lunch',
      item: { type: 'food', foodId: tortilla.id, grams: 100 },
    });
    const itemId = withItem.dayPlans[0]?.meals.find((m) => m.slot === 'lunch')?.items[0]?.id ?? '';

    const replaced = new ReplacePlanItemUseCase(deps).execute({
      itemId,
      foodId: arroz.id,
      grams: 170,
    });
    const lunch = replaced.dayPlans[0]?.meals.find((m) => m.slot === 'lunch');
    expect(lunch?.items).toHaveLength(1);
    expect(lunch?.items[0]?.label).toBe('Arroz cocido');
    expect(lunch?.totals.find((t) => t.nutrientId === 'energy_kcal')?.amount).toBe(221);

    const newItemId = lunch?.items[0]?.id ?? '';
    expect(() =>
      new ReplacePlanItemUseCase(deps).execute({ itemId: newItemId, foodId: pan.id, grams: 90 }),
    ).toThrowError('Gluten');
  });

  it('copies a day, appending after existing items', () => {
    const tortilla = new CreateFoodUseCase(foodDeps).execute({
      name: 'Tortilla',
      energyKcal: 218,
      proteinG: 5.7,
      carbohydrateG: 44.6,
      fatG: 2.9,
    });
    const plan = new CreateMealPlanUseCase(deps).execute(planCommand());
    new AddPlanItemUseCase(deps).execute({
      planId: plan.id,
      dayIndex: 0,
      mealSlot: 'breakfast',
      item: { type: 'food', foodId: tortilla.id, grams: 100 },
    });
    new AddPlanItemUseCase(deps).execute({
      planId: plan.id,
      dayIndex: 0,
      mealSlot: 'lunch',
      item: { type: 'food', foodId: tortilla.id, grams: 200 },
    });
    // Destination already has one breakfast item — copies append after it.
    new AddPlanItemUseCase(deps).execute({
      planId: plan.id,
      dayIndex: 1,
      mealSlot: 'breakfast',
      item: { type: 'food', foodId: tortilla.id, grams: 50 },
    });

    const copied = new CopyPlanDayUseCase(deps).execute({
      planId: plan.id,
      fromDayIndex: 0,
      toDayIndex: 1,
    });
    const day1 = copied.dayPlans[1];
    expect(day1?.meals.find((m) => m.slot === 'breakfast')?.items).toHaveLength(2);
    expect(day1?.meals.find((m) => m.slot === 'lunch')?.items).toHaveLength(1);
    // Day 0 untouched.
    expect(copied.dayPlans[0]?.meals.find((m) => m.slot === 'breakfast')?.items).toHaveLength(1);

    expect(() =>
      new CopyPlanDayUseCase(deps).execute({ planId: plan.id, fromDayIndex: 0, toDayIndex: 0 }),
    ).toThrowError();
    expect(() =>
      new CopyPlanDayUseCase(deps).execute({ planId: plan.id, fromDayIndex: 0, toDayIndex: 5 }),
    ).toThrowError();
  });
});

describe('household measures on the printed plan', () => {
  const makeTortilla = () =>
    new CreateFoodUseCase(foodDeps).execute({
      name: 'Tortilla de maíz',
      energyKcal: 218,
      proteinG: 5.7,
      carbohydrateG: 44.6,
      fatG: 2.9,
    });

  it('computes the grams itself from the chosen measure and freezes the label', () => {
    const tortilla = makeTortilla();
    const serving = new AddFoodServingUseCase(recipeDeps).execute({
      foodId: tortilla.id,
      name: '1 pieza',
      grams: 30,
    });
    const plan = new CreateMealPlanUseCase(deps).execute(planCommand());

    const updated = new AddPlanItemUseCase(deps).execute({
      planId: plan.id,
      dayIndex: 0,
      mealSlot: 'breakfast',
      item: { type: 'food', foodId: tortilla.id, serving: { servingId: serving.id, quantity: 2 } },
    });

    const item = updated.dayPlans[0]?.meals.find((m) => m.slot === 'breakfast')?.items[0];
    expect(item?.quantityLabel).toBe('2 × 1 pieza (60 g)');
    // Grams remain authoritative: 60 g of a 218 kcal/100 g food.
    expect(item?.totals.find((t) => t.nutrientId === 'energy_kcal')?.amount).toBe(130.8);
  });

  it('says just the measure when the quantity is one', () => {
    const tortilla = makeTortilla();
    const serving = new AddFoodServingUseCase(recipeDeps).execute({
      foodId: tortilla.id,
      name: '1 taza',
      grams: 240,
    });
    const plan = new CreateMealPlanUseCase(deps).execute(planCommand());
    const updated = new AddPlanItemUseCase(deps).execute({
      planId: plan.id,
      dayIndex: 0,
      mealSlot: 'lunch',
      item: { type: 'food', foodId: tortilla.id, serving: { servingId: serving.id, quantity: 1 } },
    });
    expect(
      updated.dayPlans[0]?.meals.find((m) => m.slot === 'lunch')?.items[0]?.quantityLabel,
    ).toBe('1 taza (240 g)');
  });

  it('keeps plain grams when no measure was used', () => {
    const tortilla = makeTortilla();
    const plan = new CreateMealPlanUseCase(deps).execute(planCommand());
    const updated = new AddPlanItemUseCase(deps).execute({
      planId: plan.id,
      dayIndex: 0,
      mealSlot: 'dinner',
      item: { type: 'food', foodId: tortilla.id, grams: 45 },
    });
    expect(
      updated.dayPlans[0]?.meals.find((m) => m.slot === 'dinner')?.items[0]?.quantityLabel,
    ).toBe('45 g');
  });

  it('rejects a measure that belongs to a different food', () => {
    const tortilla = makeTortilla();
    const arroz = new CreateFoodUseCase(foodDeps).execute({
      name: 'Arroz',
      energyKcal: 130,
      proteinG: 2.7,
      carbohydrateG: 28,
      fatG: 0.3,
    });
    const serving = new AddFoodServingUseCase(recipeDeps).execute({
      foodId: arroz.id,
      name: '1 taza',
      grams: 158,
    });
    const plan = new CreateMealPlanUseCase(deps).execute(planCommand());

    expect(() =>
      new AddPlanItemUseCase(deps).execute({
        planId: plan.id,
        dayIndex: 0,
        mealSlot: 'breakfast',
        item: {
          type: 'food',
          foodId: tortilla.id,
          serving: { servingId: serving.id, quantity: 1 },
        },
      }),
    ).toThrowError(AppError);
  });

  it('does not rewrite a delivered plan when the measure is later deleted', () => {
    const tortilla = makeTortilla();
    const serving = new AddFoodServingUseCase(recipeDeps).execute({
      foodId: tortilla.id,
      name: '1 pieza',
      grams: 30,
    });
    const plan = new CreateMealPlanUseCase(deps).execute(planCommand());
    new AddPlanItemUseCase(deps).execute({
      planId: plan.id,
      dayIndex: 0,
      mealSlot: 'breakfast',
      item: { type: 'food', foodId: tortilla.id, serving: { servingId: serving.id, quantity: 3 } },
    });

    new DeleteFoodServingUseCase(recipeDeps).execute({ servingId: serving.id });

    // The plan is a document that was handed to a patient: it must read the
    // same tomorrow as it did the day it was printed.
    const reloaded = new GetMealPlanUseCase(deps).execute({ planId: plan.id });
    expect(
      reloaded.dayPlans[0]?.meals.find((m) => m.slot === 'breakfast')?.items[0]?.quantityLabel,
    ).toBe('3 × 1 pieza (90 g)');
  });

  it('copies the measure along when a day is duplicated', () => {
    const tortilla = makeTortilla();
    const serving = new AddFoodServingUseCase(recipeDeps).execute({
      foodId: tortilla.id,
      name: '1 pieza',
      grams: 30,
    });
    const plan = new CreateMealPlanUseCase(deps).execute(planCommand());
    new AddPlanItemUseCase(deps).execute({
      planId: plan.id,
      dayIndex: 0,
      mealSlot: 'breakfast',
      item: { type: 'food', foodId: tortilla.id, serving: { servingId: serving.id, quantity: 2 } },
    });

    const copied = new CopyPlanDayUseCase(deps).execute({
      planId: plan.id,
      fromDayIndex: 0,
      toDayIndex: 1,
    });

    expect(
      copied.dayPlans[1]?.meals.find((m) => m.slot === 'breakfast')?.items[0]?.quantityLabel,
    ).toBe('2 × 1 pieza (60 g)');
  });
});

describe('archiving foods and recipes', () => {
  it('hides an archived food from search but keeps it inside an existing plan', () => {
    const tortilla = new CreateFoodUseCase(foodDeps).execute({
      name: 'Tortilla de maíz',
      energyKcal: 218,
      proteinG: 5.7,
      carbohydrateG: 44.6,
      fatG: 2.9,
    });
    const plan = new CreateMealPlanUseCase(deps).execute(planCommand());
    new AddPlanItemUseCase(deps).execute({
      planId: plan.id,
      dayIndex: 0,
      mealSlot: 'breakfast',
      item: { type: 'food', foodId: tortilla.id, grams: 100 },
    });

    new SetFoodStatusUseCase(foodDeps).execute({ foodId: tortilla.id, status: 'archived' });

    // Gone from the pickers…
    expect(new SearchFoodsUseCase(foodDeps).execute({ search: 'tortilla' })).toHaveLength(0);
    expect(
      new SearchFoodsUseCase(foodDeps).execute({ search: 'tortilla', includeArchived: true }),
    ).toHaveLength(1);
    // …but the plan that was already built still reads exactly the same.
    const reloaded = new GetMealPlanUseCase(deps).execute({ planId: plan.id });
    const item = reloaded.dayPlans[0]?.meals.find((m) => m.slot === 'breakfast')?.items[0];
    expect(item?.label).toBe('Tortilla de maíz');
    expect(item?.totals.find((t) => t.nutrientId === 'energy_kcal')?.amount).toBe(218);
  });

  it('reactivates a food and refuses a no-op transition', () => {
    const food = new CreateFoodUseCase(foodDeps).execute({
      name: 'Arroz',
      energyKcal: 130,
      proteinG: 2.7,
      carbohydrateG: 28,
      fatG: 0.3,
    });
    new SetFoodStatusUseCase(foodDeps).execute({ foodId: food.id, status: 'archived' });
    expect(() =>
      new SetFoodStatusUseCase(foodDeps).execute({ foodId: food.id, status: 'archived' }),
    ).toThrowError(AppError);

    new SetFoodStatusUseCase(foodDeps).execute({ foodId: food.id, status: 'active' });
    expect(new SearchFoodsUseCase(foodDeps).execute({ search: 'arroz' })).toHaveLength(1);
  });

  it('archives a recipe, hiding it from search while its plan items stay intact', () => {
    const tortilla = new CreateFoodUseCase(foodDeps).execute({
      name: 'Tortilla de maíz',
      energyKcal: 218,
      proteinG: 5.7,
      carbohydrateG: 44.6,
      fatG: 2.9,
    });
    const recipe = new CreateRecipeUseCase(recipeDeps).execute({
      name: 'Chilaquiles',
      yieldPortions: 4,
      ingredients: [{ foodId: tortilla.id, grams: 240 }],
    });
    const plan = new CreateMealPlanUseCase(deps).execute(planCommand());
    new AddPlanItemUseCase(deps).execute({
      planId: plan.id,
      dayIndex: 0,
      mealSlot: 'lunch',
      item: { type: 'recipe', recipeId: recipe.id, portions: 2 },
    });

    const archived = new SetRecipeStatusUseCase(recipeDeps).execute({
      recipeId: recipe.id,
      status: 'archived',
    });
    expect(archived.status).toBe('archived');

    expect(new SearchRecipesUseCase(recipeDeps).execute({ search: 'chilaquiles' })).toHaveLength(0);
    expect(
      new SearchRecipesUseCase(recipeDeps).execute({
        search: 'chilaquiles',
        includeArchived: true,
      }),
    ).toHaveLength(1);

    const reloaded = new GetMealPlanUseCase(deps).execute({ planId: plan.id });
    expect(reloaded.dayPlans[0]?.meals.find((m) => m.slot === 'lunch')?.items[0]?.label).toBe(
      'Chilaquiles',
    );
  });

  it('audits archive and restore without clinical content', () => {
    const food = new CreateFoodUseCase(foodDeps).execute({
      name: 'Avena',
      energyKcal: 379,
      proteinG: 13,
      carbohydrateG: 68,
      fatG: 7,
    });
    new SetFoodStatusUseCase(foodDeps).execute({ foodId: food.id, status: 'archived' });
    new SetFoodStatusUseCase(foodDeps).execute({ foodId: food.id, status: 'active' });

    const actions = (
      db
        .prepare(`SELECT action FROM audit_events WHERE action LIKE 'food.%' ORDER BY rowid`)
        .all() as Array<{ action: string }>
    ).map((row) => row.action);
    expect(actions).toContain('food.archive');
    expect(actions).toContain('food.restore');
  });
});
