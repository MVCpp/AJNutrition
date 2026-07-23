import { AppError } from '@ajnutrition/shared';
import type { DomainContext } from '../common/context';

export type FoodSource = 'custom' | 'fdc' | 'import';
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
    basisGrams: 100,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
