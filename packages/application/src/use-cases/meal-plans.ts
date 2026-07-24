import {
  assertPlanStatusTransition,
  createMealPlan,
  createPlanItem,
  MEAL_SLOTS,
  type DomainContext,
  type MealPlan,
  type MealSlot,
} from '@ajnutrition/domain';
import {
  computeRecipeTotals,
  macroTargetsFromEnergy,
  NUTRIENTS,
  perPortion,
  scaleNutrients,
  scaleTotals,
  sumTotals,
  teeFromPal,
  type NutrientTotal,
} from '@ajnutrition/nutrition-engine';
import {
  AppError,
  type AddPlanItemCommand,
  type CopyPlanDayCommand,
  type CreateMealPlanCommand,
  type GetMealPlanQuery,
  type ListMealPlansQuery,
  type MealPlanDto,
  type MealPlanSummaryDto,
  type RemovePlanItemCommand,
  type SetPlanStatusCommand,
  type ShoppingListDto,
  type ShoppingListQuery,
  REE_FORMULA_LABELS,
} from '@ajnutrition/shared';
import type { AuditLog } from '../ports/audit-log';
import type { ClinicalHistoryRepository } from '../ports/clinical-history-repository';
import type { ConsultationRepository } from '../ports/consultation-repository';
import type { MealPlanRepository, HydratedPlanItem } from '../ports/meal-plan-repository';
import type { MeasurementRepository } from '../ports/measurement-repository';
import type { PatientRepository } from '../ports/patient-repository';
import type { UnitOfWork } from '../ports/unit-of-work';

export interface MealPlanDeps {
  uow: UnitOfWork;
  plans: MealPlanRepository;
  measurements: MeasurementRepository;
  patients: PatientRepository;
  history: ClinicalHistoryRepository;
  consultations: ConsultationRepository;
  audit: AuditLog;
  ctx: DomainContext;
}

function enrich(totals: NutrientTotal[]) {
  return totals.map((total) => ({
    ...total,
    nameEs: NUTRIENTS[total.nutrientId]?.nameEs ?? total.nutrientId,
    unit: NUTRIENTS[total.nutrientId]?.unit ?? '',
  }));
}

function itemTotals(hydrated: HydratedPlanItem): NutrientTotal[] {
  if (hydrated.item.itemType === 'food' && hydrated.food && hydrated.item.grams !== null) {
    return scaleNutrients(hydrated.food.nutrients, hydrated.food.basisGrams, hydrated.item.grams);
  }
  if (hydrated.item.itemType === 'recipe' && hydrated.recipe && hydrated.item.portions !== null) {
    const totals = computeRecipeTotals(hydrated.recipe.ingredients);
    return scaleTotals(perPortion(totals, hydrated.recipe.yieldPortions), hydrated.item.portions);
  }
  // Catalog entry vanished: everything incomplete, nothing invented.
  return Object.keys(NUTRIENTS).map((nutrientId) => ({ nutrientId, amount: 0, complete: false }));
}

function toDto(plan: MealPlan, items: HydratedPlanItem[], allergies: string[]): MealPlanDto {
  const dayPlans = Array.from({ length: plan.days }, (_, dayIndex) => {
    const meals = MEAL_SLOTS.map((slot) => {
      const mealItems = items
        .filter((h) => h.item.dayIndex === dayIndex && h.item.mealSlot === slot)
        .sort((a, b) => a.item.displayOrder - b.item.displayOrder);
      const itemDtos = mealItems.map((h) => {
        const totals = itemTotals(h);
        return {
          id: h.item.id,
          itemType: h.item.itemType,
          label: h.food?.name ?? h.recipe?.name ?? '(eliminado del catálogo)',
          quantityLabel:
            h.item.itemType === 'food' ? `${h.item.grams} g` : `${h.item.portions} porción(es)`,
          totals: enrich(totals),
        };
      });
      return {
        slot,
        items: itemDtos,
        totals: enrich(sumTotals(mealItems.map(itemTotals))),
      };
    });
    return {
      dayIndex,
      meals,
      totals: enrich(sumTotals(items.filter((h) => h.item.dayIndex === dayIndex).map(itemTotals))),
    };
  });

  return {
    id: plan.id,
    patientId: plan.patientId,
    name: plan.name,
    days: plan.days,
    status: plan.status,
    consultationId: plan.consultationId,
    targets: {
      energyKcal: plan.energyTargetKcal,
      proteinG: plan.proteinTargetG,
      carbohydrateG: plan.carbohydrateTargetG,
      fatG: plan.fatTargetG,
    },
    targetSource: JSON.parse(plan.targetSourceJson) as Record<string, unknown>,
    allergies,
    dayPlans,
    notes: plan.notes,
    createdAt: plan.createdAt,
  };
}

export class CreateMealPlanUseCase {
  constructor(private readonly deps: MealPlanDeps) {}

  execute(command: CreateMealPlanCommand): MealPlanDto {
    const { uow, plans, measurements, patients, history, audit, ctx } = this.deps;
    return uow.run(() => {
      if (patients.findById(command.patientId) === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Paciente no encontrado.' });
      }
      if (command.consultationId !== undefined) {
        const consultation = this.deps.consultations.findById(command.consultationId);
        if (consultation === null || consultation.patientId !== command.patientId) {
          throw new AppError({
            code: 'VALIDATION',
            message: 'La consulta indicada no existe o pertenece a otro paciente.',
          });
        }
      }

      // Energy target: derived DETERMINISTICALLY in the main process — the
      // renderer never supplies computed numbers for the measurement basis.
      let energyKcal: number;
      let targetSource: Record<string, unknown>;
      if (command.basis.type === 'measurement') {
        const session = measurements.findById(command.basis.sessionId);
        if (session === null || session.patientId !== command.patientId) {
          throw new AppError({ code: 'NOT_FOUND', message: 'Sesión de medición no encontrada.' });
        }
        const reeFormulaId = command.basis.reeFormulaId ?? 'mifflin_st_jeor_ree';
        const ree = session.calculated.find((c) => c.formulaId === reeFormulaId);
        if (ree === undefined) {
          throw new AppError({
            code: 'VALIDATION',
            message:
              `La sesión seleccionada no tiene calculada la fórmula ` +
              `"${REE_FORMULA_LABELS[reeFormulaId]}". Verifique que la sesión registre los ` +
              `datos que esa fórmula requiere (p. ej. % de grasa corporal para ` +
              `Katch-McArdle/Cunningham, peso/talla y sexo para las demás).`,
          });
        }
        const tee = teeFromPal(ree.roundedResult, command.basis.pal);
        energyKcal = tee.roundedResult + command.basis.adjustmentKcal;
        targetSource = {
          type: 'measurement',
          sessionId: session.id,
          measuredAt: session.measuredAt,
          reeKcal: ree.roundedResult,
          reeFormulaId: ree.formulaId,
          reeFormulaVersion: ree.formulaVersion,
          teeFormulaId: tee.formulaId,
          teeFormulaVersion: tee.formulaVersion,
          pal: command.basis.pal,
          adjustmentKcal: command.basis.adjustmentKcal,
          teeWarnings: tee.warnings,
        };
      } else {
        energyKcal = command.basis.energyKcal;
        targetSource = { type: 'manual' };
      }

      const macros = macroTargetsFromEnergy(
        energyKcal,
        command.macros.proteinPct,
        command.macros.carbohydratePct,
        command.macros.fatPct,
      );
      targetSource['macroPct'] = command.macros;

      const plan = createMealPlan(
        {
          patientId: command.patientId,
          name: command.name,
          days: command.days,
          energyTargetKcal: energyKcal,
          proteinTargetG: macros.proteinG,
          carbohydrateTargetG: macros.carbohydrateG,
          fatTargetG: macros.fatG,
          targetSourceJson: JSON.stringify(targetSource),
          consultationId: command.consultationId ?? null,
          notes: command.notes,
        },
        ctx,
      );
      plans.insertPlan(plan);
      audit.record({
        action: 'meal-plan.create',
        entityType: 'meal-plan',
        entityId: plan.id,
        result: 'success',
        metadata: {
          patientId: plan.patientId,
          days: plan.days,
          basis: command.basis.type,
        },
      });
      return toDto(plan, [], liveAllergies(history, plan.patientId));
    });
  }
}

function liveAllergies(history: ClinicalHistoryRepository, patientId: string): string[] {
  return history
    .listByPatient(patientId, false)
    .filter((entry) => entry.category === 'allergy' || entry.category === 'intolerance')
    .map((entry) => entry.content);
}

function requirePlan(plans: MealPlanRepository, planId: string): MealPlan {
  const plan = plans.findPlanById(planId);
  if (plan === null) {
    throw new AppError({ code: 'NOT_FOUND', message: 'Plan no encontrado.' });
  }
  return plan;
}

function requireEditable(plan: MealPlan): void {
  if (plan.status === 'archived') {
    throw new AppError({
      code: 'VALIDATION',
      message: 'Un plan archivado no puede modificarse. Cree un plan nuevo si necesita cambios.',
    });
  }
}

export class AddPlanItemUseCase {
  constructor(private readonly deps: MealPlanDeps) {}

  execute(command: AddPlanItemCommand): MealPlanDto {
    const { uow, plans, history, audit, ctx } = this.deps;
    return uow.run(() => {
      const plan = requirePlan(plans, command.planId);
      requireEditable(plan);
      const item = createPlanItem(
        {
          planId: plan.id,
          planDays: plan.days,
          dayIndex: command.dayIndex,
          mealSlot: command.mealSlot as MealSlot,
          item: command.item,
          displayOrder: plans.countItems(plan.id, command.dayIndex, command.mealSlot),
        },
        ctx,
      );
      plans.insertItem(item);
      audit.record({
        action: 'meal-plan.item-add',
        entityType: 'meal-plan',
        entityId: plan.id,
        result: 'success',
        metadata: { itemType: item.itemType, dayIndex: item.dayIndex, mealSlot: item.mealSlot },
      });
      return toDto(plan, plans.listHydratedItems(plan.id), liveAllergies(history, plan.patientId));
    });
  }
}

export class RemovePlanItemUseCase {
  constructor(private readonly deps: MealPlanDeps) {}

  execute(command: RemovePlanItemCommand): MealPlanDto {
    const { uow, plans, history, audit, ctx } = this.deps;
    void ctx;
    return uow.run(() => {
      const item = plans.findItemById(command.itemId);
      if (item === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Elemento no encontrado.' });
      }
      const plan = requirePlan(plans, item.planId);
      requireEditable(plan);
      plans.deleteItem(item.id);
      audit.record({
        action: 'meal-plan.item-remove',
        entityType: 'meal-plan',
        entityId: plan.id,
        result: 'success',
        metadata: { itemType: item.itemType, dayIndex: item.dayIndex, mealSlot: item.mealSlot },
      });
      return toDto(plan, plans.listHydratedItems(plan.id), liveAllergies(history, plan.patientId));
    });
  }
}

export class GetMealPlanUseCase {
  constructor(private readonly deps: Pick<MealPlanDeps, 'plans' | 'history'>) {}

  execute(query: GetMealPlanQuery): MealPlanDto {
    const plan = requirePlan(this.deps.plans, query.planId);
    return toDto(
      plan,
      this.deps.plans.listHydratedItems(plan.id),
      liveAllergies(this.deps.history, plan.patientId),
    );
  }
}

export class SetPlanStatusUseCase {
  constructor(private readonly deps: MealPlanDeps) {}

  execute(command: SetPlanStatusCommand): MealPlanDto {
    const { uow, plans, history, audit, ctx } = this.deps;
    return uow.run(() => {
      const plan = requirePlan(plans, command.planId);
      assertPlanStatusTransition(plan.status, command.status);
      const nowIso = ctx.now().toISOString();

      // A patient has at most one active plan: activating one archives the rest.
      if (command.status === 'active') {
        for (const other of plans.listByPatient(plan.patientId)) {
          if (other.id !== plan.id && other.status === 'active') {
            plans.updatePlanStatus(other.id, 'archived', nowIso);
            audit.record({
              action: 'meal-plan.status-change',
              entityType: 'meal-plan',
              entityId: other.id,
              result: 'success',
              metadata: { from: 'active', to: 'archived', auto: true },
            });
          }
        }
      }

      plans.updatePlanStatus(plan.id, command.status, nowIso);
      audit.record({
        action: 'meal-plan.status-change',
        entityType: 'meal-plan',
        entityId: plan.id,
        result: 'success',
        metadata: { from: plan.status, to: command.status, auto: false },
      });
      const updated = { ...plan, status: command.status, updatedAt: nowIso };
      return toDto(
        updated,
        plans.listHydratedItems(plan.id),
        liveAllergies(history, plan.patientId),
      );
    });
  }
}

export class CopyPlanDayUseCase {
  constructor(private readonly deps: MealPlanDeps) {}

  execute(command: CopyPlanDayCommand): MealPlanDto {
    const { uow, plans, history, audit, ctx } = this.deps;
    return uow.run(() => {
      const plan = requirePlan(plans, command.planId);
      requireEditable(plan);
      if (
        command.fromDayIndex >= plan.days ||
        command.toDayIndex >= plan.days ||
        command.fromDayIndex === command.toDayIndex
      ) {
        throw new AppError({
          code: 'VALIDATION',
          message: 'Los días de origen y destino deben ser distintos y existir en el plan.',
        });
      }

      const source = plans.listItemsByDay(plan.id, command.fromDayIndex);
      const nextOrder = new Map<string, number>();
      for (const item of source) {
        const order =
          nextOrder.get(item.mealSlot) ??
          plans.countItems(plan.id, command.toDayIndex, item.mealSlot);
        nextOrder.set(item.mealSlot, order + 1);
        plans.insertItem(
          createPlanItem(
            {
              planId: plan.id,
              planDays: plan.days,
              dayIndex: command.toDayIndex,
              mealSlot: item.mealSlot,
              item:
                item.itemType === 'food' && item.foodId !== null && item.grams !== null
                  ? { type: 'food', foodId: item.foodId, grams: item.grams }
                  : { type: 'recipe', recipeId: item.recipeId ?? '', portions: item.portions ?? 1 },
              displayOrder: order,
            },
            ctx,
          ),
        );
      }
      audit.record({
        action: 'meal-plan.day-copy',
        entityType: 'meal-plan',
        entityId: plan.id,
        result: 'success',
        metadata: {
          fromDayIndex: command.fromDayIndex,
          toDayIndex: command.toDayIndex,
          items: source.length,
        },
      });
      return toDto(plan, plans.listHydratedItems(plan.id), liveAllergies(history, plan.patientId));
    });
  }
}

export class GenerateShoppingListUseCase {
  constructor(private readonly deps: Pick<MealPlanDeps, 'plans'>) {}

  execute(query: ShoppingListQuery): ShoppingListDto {
    const plan = requirePlan(this.deps.plans, query.planId);
    const totals = new Map<string, { foodName: string; brand: string | null; grams: number }>();

    const add = (foodId: string, foodName: string, brand: string | null, grams: number) => {
      const entry = totals.get(foodId) ?? { foodName, brand, grams: 0 };
      entry.grams += grams;
      totals.set(foodId, entry);
    };

    for (const hydrated of this.deps.plans.listHydratedItems(plan.id)) {
      if (hydrated.item.itemType === 'food' && hydrated.food && hydrated.item.grams !== null) {
        add(hydrated.food.foodId, hydrated.food.name, hydrated.food.brand, hydrated.item.grams);
      }
      if (
        hydrated.item.itemType === 'recipe' &&
        hydrated.recipe &&
        hydrated.item.portions !== null
      ) {
        // A recipe serving uses portions/yield of every ingredient.
        const factor = hydrated.item.portions / hydrated.recipe.yieldPortions;
        for (const ingredient of hydrated.recipe.ingredients) {
          add(
            ingredient.foodId,
            ingredient.foodName,
            ingredient.foodBrand,
            ingredient.grams * factor,
          );
        }
      }
    }

    const items = [...totals.entries()]
      .map(([foodId, entry]) => ({
        foodId,
        foodName: entry.foodName,
        brand: entry.brand,
        totalGrams: Math.round(entry.grams * 10) / 10,
      }))
      .sort((a, b) => a.foodName.localeCompare(b.foodName, 'es'));

    return { planId: plan.id, planName: plan.name, days: plan.days, items };
  }
}

export class ListMealPlansUseCase {
  constructor(private readonly deps: Pick<MealPlanDeps, 'plans'>) {}

  execute(query: ListMealPlansQuery): MealPlanSummaryDto[] {
    return this.deps.plans.listByPatient(query.patientId).map((plan) => ({
      id: plan.id,
      name: plan.name,
      days: plan.days,
      status: plan.status,
      energyTargetKcal: plan.energyTargetKcal,
      consultationId: plan.consultationId,
      createdAt: plan.createdAt,
    }));
  }
}
