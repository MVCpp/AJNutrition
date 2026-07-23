import { createFood, normalizeFoodName, type DomainContext, type Food } from '@ajnutrition/domain';
import { energyCoherenceWarning, isKnownNutrient, NUTRIENTS } from '@ajnutrition/nutrition-engine';
import type { CreateFoodCommand, FoodDto, SearchFoodsQuery } from '@ajnutrition/shared';
import type { AuditLog } from '../ports/audit-log';
import type { FoodRepository } from '../ports/food-repository';
import type { UnitOfWork } from '../ports/unit-of-work';

export interface FoodDeps {
  uow: UnitOfWork;
  foods: FoodRepository;
  audit: AuditLog;
  ctx: DomainContext;
}

function toDto(food: Food): FoodDto {
  const warnings: string[] = [];
  const coherence = energyCoherenceWarning(
    food.nutrients['energy_kcal'] ?? 0,
    food.nutrients['protein_g'] ?? 0,
    food.nutrients['carbohydrate_g'] ?? 0,
    food.nutrients['fat_g'] ?? 0,
  );
  if (coherence !== null) warnings.push(coherence);
  return {
    id: food.id,
    name: food.name,
    brand: food.brand,
    category: food.category,
    source: food.source,
    basisGrams: food.basisGrams,
    nutrients: Object.entries(food.nutrients).map(([nutrientId, amount]) => ({
      nutrientId,
      nameEs: NUTRIENTS[nutrientId]?.nameEs ?? nutrientId,
      amount,
      unit: NUTRIENTS[nutrientId]?.unit ?? '',
    })),
    warnings,
    createdAt: food.createdAt,
  };
}

export class CreateFoodUseCase {
  constructor(private readonly deps: FoodDeps) {}

  execute(command: CreateFoodCommand): FoodDto {
    const { uow, foods, audit, ctx } = this.deps;
    return uow.run(() => {
      const nutrients: Record<string, number> = {
        energy_kcal: command.energyKcal,
        protein_g: command.proteinG,
        carbohydrate_g: command.carbohydrateG,
        fat_g: command.fatG,
      };
      if (command.fiberG !== undefined) nutrients['fiber_g'] = command.fiberG;
      if (command.sodiumMg !== undefined) nutrients['sodium_mg'] = command.sodiumMg;

      const food = createFood(
        {
          name: command.name,
          brand: command.brand,
          category: command.category,
          nutrients,
          isKnownNutrient,
        },
        ctx,
      );
      foods.insert(food);
      audit.record({
        action: 'food.create',
        entityType: 'food',
        entityId: food.id,
        result: 'success',
        // Food names are reference data, not patient data — safe to audit.
        metadata: { name: food.name, source: food.source },
      });
      return toDto(food);
    });
  }
}

export class SearchFoodsUseCase {
  constructor(private readonly deps: Pick<FoodDeps, 'foods'>) {}

  execute(query: SearchFoodsQuery): FoodDto[] {
    const normalized = query.search ? normalizeFoodName(query.search) : undefined;
    return this.deps.foods.search(normalized, 100).map(toDto);
  }
}
