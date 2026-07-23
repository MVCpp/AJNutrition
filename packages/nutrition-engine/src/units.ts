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
