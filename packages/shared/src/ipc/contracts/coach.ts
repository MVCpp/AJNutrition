import { z } from 'zod';
import { PatientDtoSchema, PatientIdSchema } from './patient';

/**
 * Coach IPC contracts (docs/product/coach-sharing.md, C-1).
 *
 * A coach is a personal trainer who refers trainees to the practice. Nothing
 * here shares anything: these commands manage the practitioner's own record of
 * who trains with whom. Sharing a patient's data with their trainer needs an
 * express `third_party_transfer` consent and arrives in C-2.
 *
 * `.strict()` everywhere: unknown properties are rejected, not ignored.
 */

// Letters of any script, spaces, hyphens, apostrophes — never control characters.
const CONTROL_CHARS = /^[^\u0000-\u001f\u007f]+$/;

export const CoachIdSchema = z.string().uuid();
export const CoachLinkIdSchema = z.string().uuid();
export const CoachStatusSchema = z.enum(['active', 'archived']);

const nameField = z
  .string()
  .trim()
  .min(1, 'required')
  .max(100, 'too_long')
  .regex(CONTROL_CHARS, 'invalid_characters');

export const CoachDetailsSchema = z
  .object({
    displayName: nameField,
    organization: z.string().trim().max(120, 'too_long').optional(),
    email: z.string().trim().email('invalid_email').max(254).optional(),
    phone: z
      .string()
      .trim()
      .min(5, 'too_short')
      .max(25, 'too_long')
      .regex(/^[+\d][\d\s()-]*$/, 'invalid_phone')
      .optional(),
    /**
     * Commercial notes only — rates, which gym, how they met. Clinical
     * information about a trainee belongs on the trainee's record, where it is
     * encrypted, audited and exportable to the patient who owns it.
     */
    notes: z.string().trim().max(1000, 'too_long').optional(),
  })
  .strict();

export const CreateCoachCommandSchema = CoachDetailsSchema;
export type CreateCoachCommand = z.infer<typeof CreateCoachCommandSchema>;

export const UpdateCoachCommandSchema = CoachDetailsSchema.extend({
  coachId: CoachIdSchema,
}).strict();
export type UpdateCoachCommand = z.infer<typeof UpdateCoachCommandSchema>;

/** Archiving hides a coach from pickers; existing links are untouched. */
export const SetCoachStatusCommandSchema = z
  .object({ coachId: CoachIdSchema, status: CoachStatusSchema })
  .strict();
export type SetCoachStatusCommand = z.infer<typeof SetCoachStatusCommandSchema>;

export const ListCoachesQuerySchema = z
  .object({
    search: z.string().trim().max(100).optional(),
    includeArchived: z.boolean().optional(),
  })
  .strict();
export type ListCoachesQuery = z.infer<typeof ListCoachesQuerySchema>;

export const GetCoachQuerySchema = z.object({ coachId: CoachIdSchema }).strict();
export type GetCoachQuery = z.infer<typeof GetCoachQuerySchema>;

export const LinkPatientToCoachCommandSchema = z
  .object({ patientId: PatientIdSchema, coachId: CoachIdSchema })
  .strict();
export type LinkPatientToCoachCommand = z.infer<typeof LinkPatientToCoachCommandSchema>;

export const RevokeCoachLinkCommandSchema = z
  .object({
    linkId: CoachLinkIdSchema,
    reason: z.string().trim().max(500, 'too_long').optional(),
  })
  .strict();
export type RevokeCoachLinkCommand = z.infer<typeof RevokeCoachLinkCommandSchema>;

export const GetPatientCoachQuerySchema = z.object({ patientId: PatientIdSchema }).strict();
export type GetPatientCoachQuery = z.infer<typeof GetPatientCoachQuerySchema>;

export const CoachDtoSchema = z
  .object({
    id: CoachIdSchema,
    displayName: z.string(),
    organization: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    notes: z.string().nullable(),
    status: CoachStatusSchema,
    /** Patients currently linked — a count, so the list needs no second call. */
    activeTraineeCount: z.number().int().nonnegative(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type CoachDto = z.infer<typeof CoachDtoSchema>;

export const PatientCoachLinkDtoSchema = z
  .object({
    id: CoachLinkIdSchema,
    patientId: PatientIdSchema,
    coachId: CoachIdSchema,
    /** Resolved for display so the patient page needs one call, not two. */
    coachDisplayName: z.string(),
    coachStatus: CoachStatusSchema,
    linkedAt: z.string(),
    revokedAt: z.string().nullable(),
    revokedReason: z.string().nullable(),
  })
  .strict();
export type PatientCoachLinkDto = z.infer<typeof PatientCoachLinkDtoSchema>;

export const CoachTraineeDtoSchema = z
  .object({
    linkId: CoachLinkIdSchema,
    linkedAt: z.string(),
    patient: PatientDtoSchema,
  })
  .strict();
export type CoachTraineeDto = z.infer<typeof CoachTraineeDtoSchema>;

/**
 * A coach and the patients currently referred by them. Identity only — the
 * trainee list carries no measurement, plan or clinical data, because knowing
 * who someone's trainer is never implies permission to show them anything.
 */
export const CoachDetailDtoSchema = z
  .object({
    coach: CoachDtoSchema,
    trainees: z.array(CoachTraineeDtoSchema),
  })
  .strict();
export type CoachDetailDto = z.infer<typeof CoachDetailDtoSchema>;
