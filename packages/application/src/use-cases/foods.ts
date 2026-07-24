import { createFood, normalizeFoodName, type DomainContext, type Food } from '@ajnutrition/domain';
import {
  energyCoherenceWarning,
  isKnownNutrient,
  NUTRIENTS,
  toGrams,
} from '@ajnutrition/nutrition-engine';
import type {
  CreateFoodCommand,
  FoodDto,
  FoodServingDto,
  SearchFoodsQuery,
  SetFoodAllergensCommand,
  UpdateFoodCommand,
} from '@ajnutrition/shared';
import { ALLERGEN_IDS, AppError } from '@ajnutrition/shared';
import type { AuditLog } from '../ports/audit-log';
import type { FoodRepository } from '../ports/food-repository';
import type { FoodServingRepository } from '../ports/recipe-repository';
import type { UnitOfWork } from '../ports/unit-of-work';

export interface FoodDeps {
  uow: UnitOfWork;
  foods: FoodRepository;
  servings: FoodServingRepository;
  audit: AuditLog;
  ctx: DomainContext;
}

function toDto(food: Food, servings: FoodServingDto[]): FoodDto {
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
    servings,
    allergens: [...food.allergens],
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
          basisGrams: command.basis ? toGrams(command.basis.amount, command.basis.unit) : undefined,
          allergens: command.allergens,
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
      return toDto(food, []);
    });
  }
}

export class UpdateFoodUseCase {
  constructor(private readonly deps: FoodDeps) {}

  execute(command: UpdateFoodCommand): FoodDto {
    const { uow, foods, servings, audit, ctx } = this.deps;
    return uow.run(() => {
      const existing = foods.findById(command.foodId);
      if (existing === null || existing.status !== 'active') {
        throw new AppError({ code: 'NOT_FOUND', message: 'Alimento no encontrado.' });
      }
      if (existing.source !== 'custom') {
        throw new AppError({
          code: 'VALIDATION',
          message:
            'Solo los alimentos propios pueden editarse; los de catálogo son de solo lectura.',
        });
      }

      const nutrients: Record<string, number> = {
        energy_kcal: command.energyKcal,
        protein_g: command.proteinG,
        carbohydrate_g: command.carbohydrateG,
        fat_g: command.fatG,
      };
      if (command.fiberG !== undefined) nutrients['fiber_g'] = command.fiberG;
      if (command.sodiumMg !== undefined) nutrients['sodium_mg'] = command.sodiumMg;

      // Same validation rules as creation; identity and provenance preserved.
      const validated = createFood(
        {
          name: command.name,
          brand: command.brand,
          category: command.category,
          nutrients,
          basisGrams: command.basis ? toGrams(command.basis.amount, command.basis.unit) : undefined,
          allergens: command.allergens,
          isKnownNutrient,
        },
        ctx,
      );
      const updated: Food = {
        ...validated,
        id: existing.id,
        source: existing.source,
        status: existing.status,
        createdAt: existing.createdAt,
      };
      foods.update(updated);
      audit.record({
        action: 'food.update',
        entityType: 'food',
        entityId: updated.id,
        result: 'success',
        metadata: { name: updated.name, source: updated.source },
      });
      return toDto(
        updated,
        servings
          .listByFoodIds([updated.id])
          .map((serving) => ({ id: serving.id, name: serving.name, grams: serving.grams })),
      );
    });
  }
}

/**
 * Replaces a food's allergen tag set. Unlike full editing this is allowed on
 * catalog (fdc/import) foods too: tags are practitioner metadata, not source
 * data, and the hard-block is only as good as its coverage.
 */
export class SetFoodAllergensUseCase {
  constructor(private readonly deps: FoodDeps) {}

  execute(command: SetFoodAllergensCommand): FoodDto {
    const { uow, foods, servings, audit, ctx } = this.deps;
    return uow.run(() => {
      const existing = foods.findById(command.foodId);
      if (existing === null || existing.status !== 'active') {
        throw new AppError({ code: 'NOT_FOUND', message: 'Alimento no encontrado.' });
      }
      const allergens = [...new Set(command.allergens)];
      foods.setAllergens(existing.id, allergens, ctx.now().toISOString());
      audit.record({
        action: 'food.set-allergens',
        entityType: 'food',
        entityId: existing.id,
        result: 'success',
        metadata: { name: existing.name, source: existing.source, count: allergens.length },
      });
      return toDto(
        { ...existing, allergens },
        servings
          .listByFoodIds([existing.id])
          .map((serving) => ({ id: serving.id, name: serving.name, grams: serving.grams })),
      );
    });
  }
}

/** RFC-4180-style CSV: quoted fields may hold commas, quotes ("") and newlines. */
function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && content[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Accepted header names (es primary, en fallback), case/accent-insensitive. */
const CSV_COLUMNS = {
  name: ['nombre', 'name'],
  brand: ['marca', 'brand'],
  category: ['categoria', 'category'],
  energyKcal: ['energia_kcal', 'energy_kcal'],
  proteinG: ['proteina_g', 'protein_g'],
  carbohydrateG: ['carbohidratos_g', 'carbohydrate_g'],
  fatG: ['grasa_g', 'fat_g'],
  fiberG: ['fibra_g', 'fiber_g'],
  sodiumMg: ['sodio_mg', 'sodium_mg'],
  allergens: ['alergenos', 'allergens'],
} as const;

const normalizeHeader = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export interface ImportFoodsResult {
  imported: number;
  skipped: Array<{ line: number; reason: string }>;
  skippedTotal: number;
}

/**
 * Bulk CSV import (values per 100 g, source 'import'). Row failures are
 * collected, never fatal; exact name+brand duplicates are skipped so a
 * re-imported file cannot double the catalog.
 */
export class ImportFoodsCsvUseCase {
  constructor(private readonly deps: FoodDeps) {}

  execute(input: { content: string }): ImportFoodsResult {
    const { uow, foods, audit, ctx } = this.deps;
    const rows = parseCsv(input.content);
    if (rows.length < 2) {
      throw new AppError({
        code: 'VALIDATION',
        message: 'El archivo CSV no tiene encabezado y al menos una fila de datos.',
      });
    }
    const header = rows[0]!.map(normalizeHeader);
    const columnIndex: Partial<Record<keyof typeof CSV_COLUMNS, number>> = {};
    for (const [key, names] of Object.entries(CSV_COLUMNS)) {
      const index = header.findIndex((h) => (names as readonly string[]).includes(h));
      if (index >= 0) columnIndex[key as keyof typeof CSV_COLUMNS] = index;
    }
    for (const required of ['name', 'energyKcal', 'proteinG', 'carbohydrateG', 'fatG'] as const) {
      if (columnIndex[required] === undefined) {
        throw new AppError({
          code: 'VALIDATION',
          message: `Falta la columna «${CSV_COLUMNS[required][0]}» en el encabezado del CSV.`,
        });
      }
    }

    return uow.run(() => {
      let imported = 0;
      const skipped: Array<{ line: number; reason: string }> = [];
      for (let r = 1; r < rows.length; r += 1) {
        const line = r + 1;
        const cell = (key: keyof typeof CSV_COLUMNS): string => {
          const index = columnIndex[key];
          return index === undefined ? '' : (rows[r]![index] ?? '').trim();
        };
        const numeric = (key: keyof typeof CSV_COLUMNS, required: boolean): number | undefined => {
          const raw = cell(key).replace(',', '.');
          if (raw === '') {
            if (required) throw new AppError({ code: 'VALIDATION', message: `Falta ${key}.` });
            return undefined;
          }
          const value = Number(raw);
          if (!Number.isFinite(value)) {
            throw new AppError({ code: 'VALIDATION', message: `Valor no numérico en ${key}.` });
          }
          return value;
        };
        try {
          const name = cell('name');
          const allergensRaw = cell('allergens');
          const allergens = allergensRaw
            ? allergensRaw
                .split(/[;|]/)
                .map((a) => normalizeHeader(a))
                .filter(Boolean)
            : [];
          for (const allergen of allergens) {
            if (!(ALLERGEN_IDS as readonly string[]).includes(allergen)) {
              throw new AppError({
                code: 'VALIDATION',
                message: `Alérgeno desconocido: ${allergen}. Use ids: ${ALLERGEN_IDS.join(', ')}.`,
              });
            }
          }
          const brand = cell('brand') || undefined;
          const validated = createFood(
            {
              name,
              brand,
              category: cell('category') || undefined,
              nutrients: {
                energy_kcal: numeric('energyKcal', true)!,
                protein_g: numeric('proteinG', true)!,
                carbohydrate_g: numeric('carbohydrateG', true)!,
                fat_g: numeric('fatG', true)!,
                ...(numeric('fiberG', false) !== undefined
                  ? { fiber_g: numeric('fiberG', false)! }
                  : {}),
                ...(numeric('sodiumMg', false) !== undefined
                  ? { sodium_mg: numeric('sodiumMg', false)! }
                  : {}),
              },
              allergens,
              isKnownNutrient,
            },
            ctx,
          );
          const duplicate = foods
            .search(validated.nameNormalized, 20)
            .some(
              (existing) =>
                existing.nameNormalized === validated.nameNormalized &&
                (existing.brand ?? '') === (validated.brand ?? ''),
            );
          if (duplicate) {
            throw new AppError({ code: 'VALIDATION', message: 'Duplicado (nombre y marca).' });
          }
          foods.insert({ ...validated, source: 'import' });
          imported += 1;
        } catch (err) {
          skipped.push({
            line,
            reason: err instanceof AppError ? err.message : 'Fila inválida.',
          });
        }
      }
      audit.record({
        action: 'food.import',
        entityType: 'food',
        entityId: null,
        result: 'success',
        metadata: { imported, skipped: skipped.length },
      });
      return { imported, skipped: skipped.slice(0, 20), skippedTotal: skipped.length };
    });
  }
}

export class SearchFoodsUseCase {
  constructor(private readonly deps: Pick<FoodDeps, 'foods' | 'servings'>) {}

  execute(query: SearchFoodsQuery): FoodDto[] {
    const normalized = query.search ? normalizeFoodName(query.search) : undefined;
    const foods = this.deps.foods.search(normalized, 100);
    const allServings = this.deps.servings.listByFoodIds(foods.map((f) => f.id));
    return foods.map((food) =>
      toDto(
        food,
        allServings
          .filter((s) => s.foodId === food.id)
          .map((s) => ({ id: s.id, name: s.name, grams: s.grams })),
      ),
    );
  }
}
