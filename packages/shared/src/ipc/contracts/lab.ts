import { z } from 'zod';
import { PatientIdSchema } from './patient';

/**
 * Laboratory results (Phase 6). Values are recorded verbatim from the lab
 * report; the app never interprets beyond the report's own reference range.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const finite = z.number().finite();

export const LabEntryInputSchema = z
  .object({
    analyte: z.string().trim().min(1, 'required').max(100, 'too_long'),
    value: finite,
    unit: z.string().trim().min(1, 'required').max(30, 'too_long'),
    referenceLow: finite.optional(),
    referenceHigh: finite.optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.referenceLow === undefined ||
      v.referenceHigh === undefined ||
      v.referenceLow <= v.referenceHigh,
    { message: 'reference_range_inverted', path: ['referenceHigh'] },
  );

export const RecordLabResultsCommandSchema = z
  .object({
    patientId: PatientIdSchema,
    collectedAt: z.string().regex(ISO_DATE, 'invalid_date'),
    consultationId: z.string().uuid().optional(),
    entries: z.array(LabEntryInputSchema).min(1).max(50),
  })
  .strict();
export type RecordLabResultsCommand = z.infer<typeof RecordLabResultsCommandSchema>;

export const ListLabResultsQuerySchema = z.object({ patientId: PatientIdSchema }).strict();
export type ListLabResultsQuery = z.infer<typeof ListLabResultsQuerySchema>;

export const LabEntryDtoSchema = z
  .object({
    id: z.string().uuid(),
    patientId: PatientIdSchema,
    consultationId: z.string().uuid().nullable(),
    collectedAt: z.string().regex(ISO_DATE),
    analyte: z.string(),
    value: z.number(),
    unit: z.string(),
    referenceLow: z.number().nullable(),
    referenceHigh: z.number().nullable(),
    /** true only when a reference bound exists and the value falls outside. */
    outOfRange: z.boolean(),
    createdAt: z.string(),
  })
  .strict();
export type LabEntryDto = z.infer<typeof LabEntryDtoSchema>;
