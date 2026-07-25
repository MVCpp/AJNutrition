import { z } from 'zod';
import { PatientIdSchema } from './patient';

/**
 * Adherence tracking (Phase 6): a 0-100 self/practitioner-rated score per
 * check-in on how well the patient followed the plan, with optional notes.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const RecordAdherenceCommandSchema = z
  .object({
    patientId: PatientIdSchema,
    consultationId: z.string().uuid().optional(),
    recordedAt: z.string().regex(ISO_DATE, 'invalid_date'),
    score: z.number().int().min(0).max(100),
    notes: z.string().trim().max(1000, 'too_long').optional(),
  })
  .strict();
export type RecordAdherenceCommand = z.infer<typeof RecordAdherenceCommandSchema>;

export const ListAdherenceQuerySchema = z.object({ patientId: PatientIdSchema }).strict();
export type ListAdherenceQuery = z.infer<typeof ListAdherenceQuerySchema>;

export const AdherenceEntryDtoSchema = z
  .object({
    id: z.string().uuid(),
    patientId: PatientIdSchema,
    consultationId: z.string().uuid().nullable(),
    recordedAt: z.string().regex(ISO_DATE),
    score: z.number().int(),
    notes: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict();
export type AdherenceEntryDto = z.infer<typeof AdherenceEntryDtoSchema>;
