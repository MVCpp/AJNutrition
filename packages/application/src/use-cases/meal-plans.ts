import {
  assertPlanStatusTransition,
  createMealPlan,
  createPlanItem,
  MEAL_SLOTS,
  type DomainContext,
  type Food,
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
  type DuplicateMealPlanCommand,
  type CreateMealPlanCommand,
  type GetMealPlanQuery,
  type ListMealPlansQuery,
  type MealPlanDto,
  type MealPlanSummaryDto,
  type RemovePlanItemCommand,
  type SetPlanStatusCommand,
  type ReplacePlanItemCommand,
  type ShoppingListDto,
  type ShoppingListQuery,
  type SubstituteDto,
  type SubstituteSuggestionsDto,
  type SuggestSubstitutesQuery,
  ALLERGEN_LABELS,
  REE_FORMULA_LABELS,
} from '@ajnutrition/shared';
import type { AuditLog } from '../ports/audit-log';
import type { ClinicalHistoryRepository } from '../ports/clinical-history-repository';
import type { ConsultationRepository } from '../ports/consultation-repository';
import type { FoodRepository } from '../ports/food-repository';
import type { FoodServingRepository } from '../ports/recipe-repository';
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
  foods: FoodRepository;
  /** Needed to turn a chosen household measure into grams. */
  servings: FoodServingRepository;
  audit: AuditLog;
  ctx: DomainContext;
}

/**
 * What the practitioner and the patient read on the plan. Grams are always
 * shown: the household measure tells them how to serve it, the grams keep the
 * document unambiguous (and are what every total was computed from).
 */
export function planQuantityLabel(item: {
  itemType: 'food' | 'recipe';
  grams: number | null;
  portions: number | null;
  servingLabel: string | null;
  servingQuantity: number | null;
}): string {
  if (item.itemType !== 'food') return `${item.portions} porción(es)`;
  if (item.servingLabel === null || item.servingQuantity === null) return `${item.grams} g`;
  return item.servingQuantity === 1
    ? `${item.servingLabel} (${item.grams} g)`
    : `${item.servingQuantity} × ${item.servingLabel} (${item.grams} g)`;
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
          quantityLabel: planQuantityLabel(h.item),
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

function liveAllergyEntries(history: ClinicalHistoryRepository, patientId: string) {
  return history
    .listByPatient(patientId, false)
    .filter((entry) => entry.category === 'allergy' || entry.category === 'intolerance');
}

function liveAllergies(history: ClinicalHistoryRepository, patientId: string): string[] {
  return liveAllergyEntries(history, patientId).map((entry) => entry.content);
}

/**
 * Hard-block (§ Phase 5): an item whose structured allergen tags intersect the
 * patient's live structured allergy/intolerance entries can never enter a plan.
 * Free-text allergies without a structured tag only feed the warning strip.
 */
function assertNoAllergenConflict(
  deps: Pick<MealPlanDeps, 'plans' | 'history'>,
  patientId: string,
  item: AddPlanItemCommand['item'],
): void {
  const patientAllergens = new Set(
    liveAllergyEntries(deps.history, patientId)
      .map((entry) => entry.allergenId)
      .filter((id): id is string => id !== null),
  );
  if (patientAllergens.size === 0) return;
  const itemAllergens =
    item.type === 'food'
      ? deps.plans.foodAllergenIds(item.foodId)
      : deps.plans.recipeAllergenIds(item.recipeId);
  const hits = itemAllergens.filter((id) => patientAllergens.has(id));
  if (hits.length > 0) {
    const labels = hits
      .map((id) => ALLERGEN_LABELS[id as keyof typeof ALLERGEN_LABELS] ?? id)
      .join(', ');
    throw new AppError({
      code: 'VALIDATION',
      message: `Bloqueado por alergia registrada del paciente (${labels}). Este ${
        item.type === 'food' ? 'alimento' : 'platillo'
      } no puede agregarse al plan.`,
    });
  }
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

/**
 * Turns the command's amount into what gets stored: grams (always) plus the
 * frozen measure label when one was used. The lookup happens HERE, in the main
 * process — the renderer never gets to state a gram figure alongside a label
 * they might not match.
 */
function resolveFoodAmount(
  servings: FoodServingRepository,
  item: Extract<AddPlanItemCommand['item'], { type: 'food' }>,
): { type: 'food'; foodId: string; grams: number; serving?: { label: string; quantity: number } } {
  if (item.serving === undefined) {
    // The schema guarantees exactly one of the two is present.
    return { type: 'food', foodId: item.foodId, grams: item.grams as number };
  }
  const serving = servings.findById(item.serving.servingId);
  if (serving === null || serving.foodId !== item.foodId) {
    throw new AppError({
      code: 'NOT_FOUND',
      message: 'La medida casera indicada no existe para este alimento.',
    });
  }
  return {
    type: 'food',
    foodId: item.foodId,
    // Rounded to 0.1 g: binary floats must not put 90.30000000000001 in a record.
    grams: Math.round(item.serving.quantity * serving.grams * 10) / 10,
    serving: { label: serving.name, quantity: item.serving.quantity },
  };
}

export class AddPlanItemUseCase {
  constructor(private readonly deps: MealPlanDeps) {}

  execute(command: AddPlanItemCommand): MealPlanDto {
    const { uow, plans, history, servings, audit, ctx } = this.deps;
    return uow.run(() => {
      const plan = requirePlan(plans, command.planId);
      requireEditable(plan);
      assertNoAllergenConflict({ plans, history }, plan.patientId, command.item);
      const item = createPlanItem(
        {
          planId: plan.id,
          planDays: plan.days,
          dayIndex: command.dayIndex,
          mealSlot: command.mealSlot as MealSlot,
          item:
            command.item.type === 'food' ? resolveFoodAmount(servings, command.item) : command.item,
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

/**
 * Duplicates a plan: same days, same items (household measures included), as
 * a fresh draft.
 *
 * CLINICAL SAFETY: when the copy goes to a DIFFERENT patient, the target
 * provenance is NOT carried over. The original targets were derived from the
 * first patient's measurement session — presenting them as the second
 * patient's would attribute someone else's GER to them. The kilocalories are
 * kept (that is the point of reusing the plan) but recorded as a manual
 * target that names the plan it came from, so the record never claims a
 * measurement that does not belong to this patient.
 */
export class DuplicateMealPlanUseCase {
  constructor(private readonly deps: MealPlanDeps) {}

  execute(command: DuplicateMealPlanCommand): MealPlanDto {
    const { uow, plans, patients, history, audit, ctx } = this.deps;
    return uow.run(() => {
      const source = requirePlan(plans, command.planId);
      const targetPatientId = command.targetPatientId ?? source.patientId;
      if (patients.findById(targetPatientId) === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Paciente no encontrado.' });
      }

      const samePatient = targetPatientId === source.patientId;
      const sourceTargets = JSON.parse(source.targetSourceJson) as Record<string, unknown>;
      const targetSource = samePatient
        ? sourceTargets
        : {
            type: 'manual',
            copiedFromPlanId: source.id,
            copiedFromPlanName: source.name,
            ...(sourceTargets['macroPct'] !== undefined
              ? { macroPct: sourceTargets['macroPct'] }
              : {}),
          };

      const copy = createMealPlan(
        {
          patientId: targetPatientId,
          name: command.name,
          days: source.days,
          energyTargetKcal: source.energyTargetKcal,
          proteinTargetG: source.proteinTargetG,
          carbohydrateTargetG: source.carbohydrateTargetG,
          fatTargetG: source.fatTargetG,
          targetSourceJson: JSON.stringify(targetSource),
          // A duplicate belongs to no consultation until it is linked.
          consultationId: null,
          notes: source.notes ?? undefined,
        },
        ctx,
      );
      plans.insertPlan(copy);

      for (let dayIndex = 0; dayIndex < source.days; dayIndex += 1) {
        const nextOrder = new Map<string, number>();
        for (const item of plans.listItemsByDay(source.id, dayIndex)) {
          const order = nextOrder.get(item.mealSlot) ?? 0;
          nextOrder.set(item.mealSlot, order + 1);
          plans.insertItem(
            createPlanItem(
              {
                planId: copy.id,
                planDays: copy.days,
                dayIndex,
                mealSlot: item.mealSlot,
                item:
                  item.itemType === 'food' && item.foodId !== null && item.grams !== null
                    ? {
                        type: 'food',
                        foodId: item.foodId,
                        grams: item.grams,
                        ...(item.servingLabel !== null && item.servingQuantity !== null
                          ? {
                              serving: {
                                label: item.servingLabel,
                                quantity: item.servingQuantity,
                              },
                            }
                          : {}),
                      }
                    : {
                        type: 'recipe',
                        recipeId: item.recipeId ?? '',
                        portions: item.portions ?? 1,
                      },
                displayOrder: order,
              },
              ctx,
            ),
          );
        }
      }

      audit.record({
        action: 'meal-plan.duplicate',
        entityType: 'meal-plan',
        entityId: copy.id,
        result: 'success',
        metadata: { fromPlanId: source.id, samePatient: samePatient, days: copy.days },
      });
      return toDto(copy, plans.listHydratedItems(copy.id), liveAllergies(history, targetPatientId));
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
                  ? {
                      type: 'food',
                      foodId: item.foodId,
                      grams: item.grams,
                      // Copying a day must reproduce it exactly, measure included.
                      ...(item.servingLabel !== null && item.servingQuantity !== null
                        ? {
                            serving: {
                              label: item.servingLabel,
                              quantity: item.servingQuantity,
                            },
                          }
                        : {}),
                    }
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

/** Energy share (%) of each macro via Atwater 4/4/9; null when no macros. */
function atwaterShares(food: Food): { p: number; c: number; f: number } | null {
  const p = 4 * (food.nutrients['protein_g'] ?? 0);
  const c = 4 * (food.nutrients['carbohydrate_g'] ?? 0);
  const f = 9 * (food.nutrients['fat_g'] ?? 0);
  const total = p + c + f;
  if (total <= 0) return null;
  return { p: (p / total) * 100, c: (c / total) * 100, f: (f / total) * 100 };
}

function nutrientForGrams(food: Food, nutrientId: string, grams: number): number {
  return Math.round(((food.nutrients[nutrientId] ?? 0) / food.basisGrams) * grams * 10) / 10;
}

const normalizeCategory = (category: string | null): string | null =>
  category === null ? null : category.trim().toLowerCase();

/**
 * Isoenergetic substitution suggestions for a food plan item: candidates from
 * the same category (all categories when the original has none or the
 * category yields nothing), re-portioned to match the item's energy and
 * ranked by Atwater macro-profile similarity. Foods carrying a structured
 * allergen of the patient never appear — same rule as the add-item block.
 */
export class SuggestSubstitutesUseCase {
  constructor(private readonly deps: Pick<MealPlanDeps, 'plans' | 'foods' | 'history'>) {}

  execute(query: SuggestSubstitutesQuery): SubstituteSuggestionsDto {
    const { plans, foods, history } = this.deps;
    const item = plans.findItemById(query.itemId);
    if (item === null) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Elemento no encontrado.' });
    }
    if (item.itemType !== 'food' || item.foodId === null || item.grams === null) {
      throw new AppError({
        code: 'VALIDATION',
        message: 'Solo los alimentos individuales admiten sustituciones.',
      });
    }
    const plan = requirePlan(plans, item.planId);
    const original = foods.findById(item.foodId);
    if (original === null) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Alimento no encontrado en el catálogo.' });
    }
    const originalKcalPerGram = (original.nutrients['energy_kcal'] ?? 0) / original.basisGrams;
    if (originalKcalPerGram <= 0) {
      throw new AppError({
        code: 'VALIDATION',
        message: 'El alimento original no tiene energía registrada; no es posible sustituirlo.',
      });
    }
    const targetKcal = originalKcalPerGram * item.grams;
    const originalShares = atwaterShares(original);
    const patientAllergens = new Set(
      liveAllergyEntries(history, plan.patientId)
        .map((entry) => entry.allergenId)
        .filter((id): id is string => id !== null),
    );

    const all = foods
      .search(undefined, 500)
      .filter(
        (candidate) =>
          candidate.id !== original.id &&
          (candidate.nutrients['energy_kcal'] ?? 0) > 0 &&
          !candidate.allergens.some((id) => patientAllergens.has(id)),
      );
    const originalCategory = normalizeCategory(original.category);
    const sameCategory =
      originalCategory === null
        ? []
        : all.filter((candidate) => normalizeCategory(candidate.category) === originalCategory);
    const pool = sameCategory.length > 0 ? sameCategory : all;

    const suggestions: SubstituteDto[] = pool
      .map((candidate) => {
        const kcalPerGram = (candidate.nutrients['energy_kcal'] ?? 0) / candidate.basisGrams;
        const grams = Math.max(5, Math.round(targetKcal / kcalPerGram / 5) * 5);
        const shares = atwaterShares(candidate);
        const profileDistance =
          originalShares !== null && shares !== null
            ? Math.round(
                (Math.abs(originalShares.p - shares.p) +
                  Math.abs(originalShares.c - shares.c) +
                  Math.abs(originalShares.f - shares.f)) *
                  10,
              ) / 10
            : 200;
        return {
          foodId: candidate.id,
          name: candidate.name,
          brand: candidate.brand,
          category: candidate.category,
          grams,
          energyKcal: nutrientForGrams(candidate, 'energy_kcal', grams),
          proteinG: nutrientForGrams(candidate, 'protein_g', grams),
          carbohydrateG: nutrientForGrams(candidate, 'carbohydrate_g', grams),
          fatG: nutrientForGrams(candidate, 'fat_g', grams),
          profileDistance,
        };
      })
      .sort((a, b) => a.profileDistance - b.profileDistance || a.name.localeCompare(b.name, 'es'))
      .slice(0, 8);

    return {
      itemId: item.id,
      original: {
        foodId: original.id,
        name: original.name,
        grams: item.grams,
        energyKcal: nutrientForGrams(original, 'energy_kcal', item.grams),
        proteinG: nutrientForGrams(original, 'protein_g', item.grams),
        carbohydrateG: nutrientForGrams(original, 'carbohydrate_g', item.grams),
        fatG: nutrientForGrams(original, 'fat_g', item.grams),
      },
      suggestions,
    };
  }
}

/** Swaps a food item for another food in place (same day, slot and position). */
export class ReplacePlanItemUseCase {
  constructor(private readonly deps: MealPlanDeps) {}

  execute(command: ReplacePlanItemCommand): MealPlanDto {
    const { uow, plans, foods, history, audit, ctx } = this.deps;
    return uow.run(() => {
      const item = plans.findItemById(command.itemId);
      if (item === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Elemento no encontrado.' });
      }
      if (item.itemType !== 'food') {
        throw new AppError({
          code: 'VALIDATION',
          message: 'Solo los alimentos individuales admiten sustituciones.',
        });
      }
      const plan = requirePlan(plans, item.planId);
      requireEditable(plan);
      const replacement = foods.findById(command.foodId);
      if (replacement === null || replacement.status !== 'active') {
        throw new AppError({ code: 'NOT_FOUND', message: 'Alimento no encontrado.' });
      }
      assertNoAllergenConflict({ plans, history }, plan.patientId, {
        type: 'food',
        foodId: command.foodId,
        grams: command.grams,
      });

      const successor = createPlanItem(
        {
          planId: plan.id,
          planDays: plan.days,
          dayIndex: item.dayIndex,
          mealSlot: item.mealSlot as MealSlot,
          // No serving snapshot: a substitute is a DIFFERENT food, so the
          // measure the original was entered with ("1 tortilla") would be a
          // lie about what is now on the plate.
          item: { type: 'food', foodId: command.foodId, grams: command.grams },
          displayOrder: item.displayOrder,
        },
        ctx,
      );
      plans.deleteItem(item.id);
      plans.insertItem(successor);
      audit.record({
        action: 'meal-plan.item-replace',
        entityType: 'meal-plan',
        entityId: plan.id,
        result: 'success',
        metadata: { dayIndex: item.dayIndex, mealSlot: item.mealSlot },
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
      consultationId: plan.consultationId,
      createdAt: plan.createdAt,
    }));
  }
}
