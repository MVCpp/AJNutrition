import { AppError } from '@ajnutrition/shared';

/**
 * De-identification layer. NOTHING reaches a provider except what this module
 * produces: structured, already-computed numbers plus age and sex.
 *
 * Deliberately excluded, and enforced by assertDeidentified below:
 * - names, file numbers, email, phone, address
 * - dates of birth and calendar dates (day offsets are used instead, so a
 *   series still shows spacing without pinning it to a real calendar)
 * - free text (SOAP notes, adherence notes, lab comments) — it can carry
 *   identifiers and is the natural home for prompt injection
 */

export interface DeidentifiedPoint {
  /** Days elapsed since the first record in the series (never a real date). */
  dayOffset: number;
  value: number;
}

export interface DeidentifiedSeries {
  metric: string;
  unit: string;
  points: DeidentifiedPoint[];
}

export interface DeidentifiedContext {
  ageYears: number;
  sexAtBirth: 'female' | 'male' | 'unspecified';
  series: DeidentifiedSeries[];
  /** Adherence scores 0-100, same day-offset basis. */
  adherence: DeidentifiedPoint[];
  /** Out-of-range labs only: analyte name plus value and the report's range. */
  labFlags: Array<{ analyte: string; value: number; unit: string; low: number; high: number }>;
  /** Energy target of the active plan, if any (kcal/day). */
  targetKcal: number | null;
  spanDays: number;
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(?:\+?\d[\d\s()-]{7,})/;
const ISO_DATE = /\d{4}-\d{2}-\d{2}/;

/**
 * Last line of defense before egress: rejects a payload that still carries an
 * obvious identifier. A thrown error here is a bug in the caller, not user
 * error — nothing is sent.
 */
export function assertDeidentified(payload: string, forbiddenTerms: readonly string[] = []): void {
  const problems: string[] = [];
  if (EMAIL.test(payload)) problems.push('email');
  if (PHONE.test(payload)) problems.push('teléfono');
  if (ISO_DATE.test(payload)) problems.push('fecha');
  const haystack = payload.toLowerCase();
  for (const term of forbiddenTerms) {
    const needle = term.trim().toLowerCase();
    // Two characters or fewer would match inside ordinary words.
    if (needle.length > 2 && haystack.includes(needle)) problems.push('nombre');
  }
  if (problems.length > 0) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'No se envió nada: el contenido aún contenía datos identificables.',
      internalDetail: `de-identification guard tripped on: ${[...new Set(problems)].join(', ')}`,
    });
  }
}

/** Whole days between two ISO dates (YYYY-MM-DD), floor, never negative. */
export function dayOffset(fromIsoDate: string, toIsoDate: string): number {
  const from = Date.parse(`${fromIsoDate}T00:00:00Z`);
  const to = Date.parse(`${toIsoDate}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}
