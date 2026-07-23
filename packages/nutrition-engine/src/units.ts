import { AppError } from '@ajnutrition/shared';

/**
 * Anthropometric input validation (§13.2). Plausibility bounds are for
 * ADULTS — the v1 clinical population. Pediatric ranges arrive with
 * pediatric formulas, never by silently widening these.
 */

export interface MetricBounds {
  min: number;
  max: number;
  unit: string;
}

export const METRIC_BOUNDS = {
  weight_kg: { min: 20, max: 400, unit: 'kg' },
  height_cm: { min: 100, max: 250, unit: 'cm' },
  waist_cm: { min: 40, max: 250, unit: 'cm' },
  hip_cm: { min: 50, max: 250, unit: 'cm' },
} as const satisfies Record<string, MetricBounds>;

export type MetricKey = keyof typeof METRIC_BOUNDS;

export function assertMetric(metric: MetricKey, value: number): void {
  const bounds = METRIC_BOUNDS[metric];
  if (!Number.isFinite(value) || value < bounds.min || value > bounds.max) {
    throw new AppError({
      code: 'VALIDATION',
      message: `El valor de ${metric} debe estar entre ${bounds.min} y ${bounds.max} ${bounds.unit}.`,
      fieldErrors: { [metric]: ['out_of_range'] },
    });
  }
}

/** Deterministic half-up rounding to N decimals (no floating-point display drift). */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Mass units accepted for food-composition bases. Exact factors by
 * definition (NIST Handbook 44, Appendix C): 1 lb = 453.59237 g,
 * 1 oz (avoirdupois) = 28.349523125 g.
 */
export const WEIGHT_UNITS = {
  g: { gramsPerUnit: 1, labelEs: 'g' },
  oz: { gramsPerUnit: 28.349523125, labelEs: 'oz' },
  lb: { gramsPerUnit: 453.59237, labelEs: 'lb' },
} as const satisfies Record<string, { gramsPerUnit: number; labelEs: string }>;

export type WeightUnit = keyof typeof WEIGHT_UNITS;

/** Convert an amount in a supported mass unit to grams (2-decimal determinism). */
export function toGrams(amount: number, unit: WeightUnit): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'La cantidad debe ser un número positivo.',
      fieldErrors: { amount: ['invalid_amount'] },
    });
  }
  return roundTo(amount * WEIGHT_UNITS[unit].gramsPerUnit, 2);
}
