import { z } from 'zod';
import { PatientIdSchema } from './patient';

/**
 * Consultation IPC contracts (Clinical Consultations bounded context).
 * SOAP structure; signed notes are immutable — changes travel as amendments.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_MAX = 10000;

export const ConsultationIdSchema = z.string().uuid();
export const ConsultationTypeSchema = z.enum(['initial', 'follow_up', 'other']);
export type ConsultationType = z.infer<typeof ConsultationTypeSchema>;

const noteField = z.string().trim().max(NOTE_MAX, 'too_long').optional();

export const CreateConsultationCommandSchema = z
  .object({
    patientId: PatientIdSchema,
    consultationDate: z.string().regex(ISO_DATE, 'invalid_date'),
    consultationType: ConsultationTypeSchema,
    subjective: noteField,
    objective: noteField,
    assessment: noteField,
    plan: noteField,
  })
  .strict();
export type CreateConsultationCommand = z.infer<typeof CreateConsultationCommandSchema>;

export const ListConsultationsQuerySchema = z.object({ patientId: PatientIdSchema }).strict();
export type ListConsultationsQuery = z.infer<typeof ListConsultationsQuerySchema>;

export const SignConsultationCommandSchema = z
  .object({ consultationId: ConsultationIdSchema })
  .strict();
export type SignConsultationCommand = z.infer<typeof SignConsultationCommandSchema>;

export const AmendConsultationCommandSchema = z
  .object({
    consultationId: ConsultationIdSchema,
    reason: z.string().trim().min(3, 'too_short').max(500, 'too_long'),
    content: z.string().trim().min(1, 'required').max(NOTE_MAX, 'too_long'),
  })
  .strict();
export type AmendConsultationCommand = z.infer<typeof AmendConsultationCommandSchema>;

export const AmendmentDtoSchema = z
  .object({
    id: z.string().uuid(),
    reason: z.string(),
    content: z.string(),
    createdAt: z.string(),
  })
  .strict();
export type AmendmentDto = z.infer<typeof AmendmentDtoSchema>;

export const ConsultationDtoSchema = z
  .object({
    id: ConsultationIdSchema,
    patientId: PatientIdSchema,
    consultationDate: z.string().regex(ISO_DATE),
    consultationType: ConsultationTypeSchema,
    subjective: z.string().nullable(),
    objective: z.string().nullable(),
    assessment: z.string().nullable(),
    plan: z.string().nullable(),
    status: z.enum(['draft', 'signed']),
    signedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    amendments: z.array(AmendmentDtoSchema),
  })
  .strict();
export type ConsultationDto = z.infer<typeof ConsultationDtoSchema>;
