import { z } from 'zod';

/**
 * Patient IPC contracts. These schemas run on BOTH sides of the boundary:
 * the renderer uses them for form validation, the main process re-validates
 * every incoming payload (the renderer is untrusted).
 *
 * `.strict()` everywhere: unknown properties are rejected, not ignored.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Recorded for clinical calculations (energy formulas, references). 'unspecified' is allowed and calculations that require it will prompt. */
export const SexAtBirthSchema = z.enum(['female', 'male', 'unspecified']);

export const PatientIdSchema = z.string().uuid();

// Names may contain letters of any script, spaces, hyphens, apostrophes, periods —
// but never control characters.
const CONTROL_CHARS = /^[^\u0000-\u001f\u007f]+$/;

const nameField = z
  .string()
  .trim()
  .min(1, 'required')
  .max(100, 'too_long')
  .regex(CONTROL_CHARS, 'invalid_characters');

export const CreatePatientCommandSchema = z
  .object({
    firstName: nameField,
    lastName: nameField,
    dateOfBirth: z.string().regex(ISO_DATE, 'invalid_date'),
    sexAtBirth: SexAtBirthSchema,
    email: z.string().trim().email('invalid_email').max(254).optional(),
    phone: z
      .string()
      .trim()
      .min(5, 'too_short')
      .max(25, 'too_long')
      .regex(/^[+\d][\d\s()-]*$/, 'invalid_phone')
      .optional(),
  })
  .strict();

export type CreatePatientCommand = z.infer<typeof CreatePatientCommandSchema>;

export const ListPatientsQuerySchema = z
  .object({
    search: z.string().trim().max(100).optional(),
    includeArchived: z.boolean().optional(),
  })
  .strict();

export type ListPatientsQuery = z.infer<typeof ListPatientsQuerySchema>;

export const GetPatientQuerySchema = z.object({ patientId: PatientIdSchema }).strict();
export type GetPatientQuery = z.infer<typeof GetPatientQuerySchema>;

export const PatientStatusSchema = z.enum(['active', 'archived']);

export const PatientDtoSchema = z
  .object({
    id: PatientIdSchema,
    fileNumber: z.number().int().positive(),
    firstName: z.string(),
    lastName: z.string(),
    dateOfBirth: z.string().regex(ISO_DATE),
    sexAtBirth: SexAtBirthSchema,
    email: z.string().nullable(),
    phone: z.string().nullable(),
    status: PatientStatusSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

export type PatientDto = z.infer<typeof PatientDtoSchema>;
