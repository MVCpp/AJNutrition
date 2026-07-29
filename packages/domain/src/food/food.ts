import { AppError } from '@ajnutrition/shared';
import type { DomainContext } from '../common/context';

export type FoodSource = 'custom' | 'fdc' | 'import' | 'mx';
export type FoodStatus = 'active' | 'archived';

/**
 * Food aggregate (Food Composition bounded context). Nutrient amounts live
 * in a separate value map with an EXPLICIT basis (per 100 g in v1) — values
 * are never stored without their basis (§12.11).
 */
export interface Food {
  readonly id: string;
  readonly name: string;
  /** Lowercased, accent-stripped — the search key. */
  readonly nameNormalized: string;
  readonly brand: string | null;
  readonly category: string | null;
  readonly source: FoodSource;
  readonly status: FoodStatus;
  /** nutrientId → amount per basisGrams. */
  readonly nutrients: Readonly<Record<string, number>>;
  readonly basisGrams: number;
  /** Structured allergen tags from the shared vocabulary. */
  readonly allergens: readonly string[];
  /** SMAE equivalences recorded by the practitioner: group → grams per equivalente. */
  readonly equivalences: ReadonlyArray<{ groupId: string; gramsPerEquivalent: number }>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Accent-insensitive normalization for search (ñ → n, á → a, case-folded). */
export function normalizeFoodName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function createFood(
  input: {
    name: string;
    brand?: string | undefined;
    category?: string | undefined;
    nutrients: Record<string, number>;
    /** Base in grams for the nutrient amounts; defaults to 100 g. */
    basisGrams?: number | undefined;
    allergens?: readonly string[] | undefined;
    /** Injected validator — the domain does not own the nutrient registry. */
    isKnownNutrient: (id: string) => boolean;
  },
  ctx: DomainContext,
): Food {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'El nombre del alimento es obligatorio.',
      fieldErrors: { name: ['required'] },
    });
  }
  for (const [nutrientId, amount] of Object.entries(input.nutrients)) {
    if (!input.isKnownNutrient(nutrientId)) {
      throw new AppError({
        code: 'VALIDATION',
        message: `Nutriente desconocido: ${nutrientId}.`,
        fieldErrors: { nutrients: ['unknown_nutrient'] },
      });
    }
    if (!Number.isFinite(amount) || amount < 0 || amount > 100000) {
      throw new AppError({
        code: 'VALIDATION',
        message: 'Los valores nutrimentales deben ser números no negativos.',
        fieldErrors: { [nutrientId]: ['invalid_amount'] },
      });
    }
  }
  if (
    input.basisGrams !== undefined &&
    (!Number.isFinite(input.basisGrams) || input.basisGrams <= 0 || input.basisGrams > 100000)
  ) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'La base de los valores debe ser una cantidad positiva.',
      fieldErrors: { basisGrams: ['invalid_amount'] },
    });
  }
  const nowIso = ctx.now().toISOString();
  return {
    id: ctx.newId(),
    name,
    nameNormalized: normalizeFoodName(name),
    brand: input.brand?.trim() || null,
    category: input.category?.trim() || null,
    source: 'custom',
    status: 'active',
    nutrients: { ...input.nutrients },
    basisGrams: input.basisGrams ?? 100,
    equivalences: [],
    allergens: [...new Set(input.allergens ?? [])],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Archiving hides a food from every picker without deleting it. Deletion is
 * not an option: plans and recipes already reference it, and a plan that was
 * handed to a patient must keep meaning what it said. Existing references
 * keep resolving — only searches stop offering it.
 */
export function setFoodStatus(food: Food, status: FoodStatus, ctx: DomainContext): Food {
  if (food.status === status) {
    throw new AppError({
      code: 'VALIDATION',
      message:
        status === 'archived' ? 'El alimento ya está archivado.' : 'El alimento ya está activo.',
    });
  }
  return { ...food, status, updatedAt: ctx.now().toISOString() };
}
