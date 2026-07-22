import { AppError } from '@ajnutrition/shared';
import type { DomainContext } from '../common/context';
import { parseIsoDate } from '../patient/patient';

export type ConsultationType = 'initial' | 'follow_up' | 'other';
export type ConsultationStatus = 'draft' | 'signed';

/**
 * Consultation aggregate (Clinical Consultations bounded context).
 *
 * Clinical-record rule: a SIGNED consultation is immutable. Corrections and
 * additions are appended as amendments with author-visible reason and
 * timestamp — the original text is never rewritten (§12.6 of the brief).
 */
export interface Consultation {
  readonly id: string;
  readonly patientId: string;
  /** Calendar date of the encounter (YYYY-MM-DD). */
  readonly consultationDate: string;
  readonly consultationType: ConsultationType;
  readonly subjective: string | null;
  readonly objective: string | null;
  readonly assessment: string | null;
  readonly plan: string | null;
  readonly status: ConsultationStatus;
  readonly signedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface ConsultationAmendment {
  readonly id: string;
  readonly consultationId: string;
  readonly reason: string;
  readonly content: string;
  readonly createdAt: string;
}

export interface NewConsultationInput {
  patientId: string;
  consultationDate: string;
  consultationType: ConsultationType;
  subjective?: string | undefined;
  objective?: string | undefined;
  assessment?: string | undefined;
  plan?: string | undefined;
}

function normalizeNote(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function createConsultation(input: NewConsultationInput, ctx: DomainContext): Consultation {
  const fieldErrors: Record<string, string[]> = {};

  const date = parseIsoDate(input.consultationDate);
  if (date === null) {
    fieldErrors['consultationDate'] = ['invalid_date'];
  } else if (date.getTime() > ctx.now().getTime()) {
    fieldErrors['consultationDate'] = ['date_in_future'];
  }

  const subjective = normalizeNote(input.subjective);
  const objective = normalizeNote(input.objective);
  const assessment = normalizeNote(input.assessment);
  const plan = normalizeNote(input.plan);
  if (!subjective && !objective && !assessment && !plan) {
    fieldErrors['subjective'] = ['at_least_one_section'];
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'La nota de consulta no es válida.',
      fieldErrors,
    });
  }

  const nowIso = ctx.now().toISOString();
  return {
    id: ctx.newId(),
    patientId: input.patientId,
    consultationDate: input.consultationDate,
    consultationType: input.consultationType,
    subjective,
    objective,
    assessment,
    plan,
    status: 'draft',
    signedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    version: 1,
  };
}

/** Draft → signed. Signing twice is a conflict, never a silent no-op. */
export function signConsultation(consultation: Consultation, ctx: DomainContext): Consultation {
  if (consultation.status === 'signed') {
    throw new AppError({
      code: 'CONFLICT',
      message: 'La consulta ya está firmada.',
    });
  }
  const nowIso = ctx.now().toISOString();
  return {
    ...consultation,
    status: 'signed',
    signedAt: nowIso,
    updatedAt: nowIso,
    version: consultation.version + 1,
  };
}

/** Amendments exist ONLY for signed consultations — drafts are simply edited. */
export function createAmendment(
  consultation: Consultation,
  input: { reason: string; content: string },
  ctx: DomainContext,
): ConsultationAmendment {
  if (consultation.status !== 'signed') {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Solo las consultas firmadas se corrigen mediante enmiendas.',
    });
  }
  const reason = input.reason.trim();
  const content = input.content.trim();
  if (reason.length === 0 || content.length === 0) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'La enmienda requiere motivo y contenido.',
      fieldErrors: {
        ...(reason.length === 0 ? { reason: ['required'] } : {}),
        ...(content.length === 0 ? { content: ['required'] } : {}),
      },
    });
  }
  return {
    id: ctx.newId(),
    consultationId: consultation.id,
    reason,
    content,
    createdAt: ctx.now().toISOString(),
  };
}
