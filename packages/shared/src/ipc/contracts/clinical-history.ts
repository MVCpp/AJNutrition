import { z } from 'zod';
import { PatientIdSchema } from './patient';

/**
 * Clinical history IPC contracts (Patient Records bounded context).
 * Entries are TEMPORAL: they are never edited or deleted — an update creates
 * a new entry that supersedes its predecessor, preserving the clinical past.
 */

export const HistoryCategorySchema = z.enum([
  'allergy',
  'intolerance',
  'pathological',
  'non_pathological',
  'family',
  'medication',
  'supplement',
  'surgery',
  'dietary_pattern',
  'physical_activity',
  'preference',
  'other',
]);
export type HistoryCategory = z.infer<typeof HistoryCategorySchema>;

export const HistoryEntryIdSchema = z.string().uuid();

export const AddHistoryEntryCommandSchema = z
  .object({
    patientId: PatientIdSchema,
    category: HistoryCategorySchema,
    content: z.string().trim().min(1, 'required').max(4000, 'too_long'),
    /** When set, the new entry replaces this one (which stays as history). */
    supersedesId: HistoryEntryIdSchema.optional(),
  })
  .strict();
export type AddHistoryEntryCommand = z.infer<typeof AddHistoryEntryCommandSchema>;

export const ListHistoryQuerySchema = z
  .object({
    patientId: PatientIdSchema,
    includeSuperseded: z.boolean().optional(),
  })
  .strict();
export type ListHistoryQuery = z.infer<typeof ListHistoryQuerySchema>;

export const HistoryEntryDtoSchema = z
  .object({
    id: HistoryEntryIdSchema,
    patientId: PatientIdSchema,
    category: HistoryCategorySchema,
    content: z.string(),
    createdAt: z.string(),
    supersededAt: z.string().nullable(),
    supersededById: z.string().nullable(),
  })
  .strict();
export type HistoryEntryDto = z.infer<typeof HistoryEntryDtoSchema>;
