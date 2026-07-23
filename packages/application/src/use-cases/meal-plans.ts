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
} from '@ajnutrition/shared';
import type { AuditLog } from '../ports/audit-log';
import type { ClinicalHistoryRepository } from '../ports/clinical-history-repository';
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

      // Energy target: derived DETERMINISTICALLY in the main process — the
      // renderer never supplies computed numbers for the measurement basis.
      let energyKcal: number;
      let targetSource: Record<string, unknown>;
      if (command.basis.type === 'measurement') {
        const session = measurements.findById(command.basis.sessionId);
        if (session === null || session.patientId !== command.patientId) {
          throw new AppError({ code: 'NOT_FOUND', message: 'Sesión de medición no encontrada.' });
        }
        const ree = session.calculated.find((c) => c.formulaId === 'mifflin_st_jeor_ree');
        if (ree === undefined) {
          throw new AppError({
            code: 'VALIDATION',
            message:
              'La sesión seleccionada no tiene gasto energético en reposo calculado (requiere peso, talla y sexo registrado).',
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

function requireDraft(plan: MealPlan): void {
  if (plan.status !== 'draft') {
    throw new AppError({
      code: 'VALIDATION',
      message: 'Solo se puede editar un plan en estado borrador.',
    });
  }
}

export class AddPlanItemUseCase {
  constructor(private readonly deps: MealPlanDeps) {}

  execute(command: AddPlanItemCommand): MealPlanDto {
    const { uow, plans, history, audit, ctx } = this.deps;
    return uow.run(() => {
      const plan = requirePlan(plans, command.planId);
      requireDraft(plan);
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
      requireDraft(plan);
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
      requireDraft(plan);
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

export class ListMealPlansUseCase {
  constructor(private readonly deps: Pick<MealPlanDeps, 'plans'>) {}

  execute(query: ListMealPlansQuery): MealPlanSummaryDto[] {
    return this.deps.plans.listByPatient(query.patientId).map((plan) => ({
      id: plan.id,
      name: plan.name,
      days: plan.days,
      status: plan.status,
      energyTargetKcal: plan.energyTargetKcal,
      createdAt: plan.createdAt,
    }));
  }
}
