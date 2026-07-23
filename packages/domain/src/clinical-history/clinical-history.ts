import { AppError } from '@ajnutrition/shared';
import type { DomainContext } from '../common/context';

export type HistoryCategory =
  | 'allergy'
  | 'intolerance'
  | 'pathological'
  | 'non_pathological'
  | 'family'
  | 'medication'
  | 'supplement'
  | 'surgery'
  | 'dietary_pattern'
  | 'physical_activity'
  | 'preference'
  | 'other';

/**
 * Temporal clinical-history entry (§12.4 of the brief): historical medical
 * information is never overwritten. An entry is immutable once created;
 * "updating" means creating a successor and marking this one superseded.
 */
export interface ClinicalHistoryEntry {
  readonly id: string;
  readonly patientId: string;
  readonly category: HistoryCategory;
  readonly content: string;
  readonly createdAt: string;
  readonly supersededAt: string | null;
  readonly supersededById: string | null;
}

export function createHistoryEntry(
  input: { patientId: string; category: HistoryCategory; content: string },
  ctx: DomainContext,
): ClinicalHistoryEntry {
  const content = input.content.trim();
  if (content.length === 0) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'El antecedente no puede estar vacío.',
      fieldErrors: { content: ['required'] },
    });
  }
  return {
    id: ctx.newId(),
    patientId: input.patientId,
    category: input.category,
    content,
    createdAt: ctx.now().toISOString(),
    supersededAt: null,
    supersededById: null,
  };
}

/** Validates that `predecessor` can be superseded by an entry for the same patient and category. */
export function assertCanSupersede(
  predecessor: ClinicalHistoryEntry,
  patientId: string,
  category: HistoryCategory,
): void {
  if (predecessor.patientId !== patientId) {
    throw new AppError({
      code: 'CONFLICT',
      message: 'El antecedente a actualizar pertenece a otro paciente.',
    });
  }
  if (predecessor.category !== category) {
    throw new AppError({
      code: 'CONFLICT',
      message: 'El antecedente a actualizar pertenece a otra categoría.',
    });
  }
  if (predecessor.supersededAt !== null) {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Este antecedente ya fue actualizado por una versión más reciente.',
    });
  }
}
