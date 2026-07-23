import { z } from 'zod';
import { PatientIdSchema } from './patient';

/**
 * Consent IPC contracts (Privacy and Consent bounded context, §10 of the
 * brief). A consent record is an append-only legal fact: it is never edited
 * or deleted. The only permitted mutation is WITHDRAWAL of an accepted
 * consent, which stamps withdrawnAt — the record itself remains.
 */

export const ConsentTypeSchema = z.enum([
  'data_processing',
  'photo',
  'ai_processing',
  'communications',
  'third_party_transfer',
]);
export type ConsentType = z.infer<typeof ConsentTypeSchema>;

export const ConsentMethodSchema = z.enum(['verbal', 'written', 'digital']);
export type ConsentMethod = z.infer<typeof ConsentMethodSchema>;

export const ConsentIdSchema = z.string().uuid();

export const RecordConsentCommandSchema = z
  .object({
    patientId: PatientIdSchema,
    consentType: ConsentTypeSchema,
    /** Version of the privacy notice / consent text that was presented. */
    noticeVersion: z.string().trim().min(1, 'required').max(50, 'too_long'),
    decision: z.enum(['accepted', 'declined']),
    method: ConsentMethodSchema,
    notes: z.string().trim().max(1000, 'too_long').optional(),
  })
  .strict();
export type RecordConsentCommand = z.infer<typeof RecordConsentCommandSchema>;

export const WithdrawConsentCommandSchema = z.object({ consentId: ConsentIdSchema }).strict();
export type WithdrawConsentCommand = z.infer<typeof WithdrawConsentCommandSchema>;

export const ListConsentsQuerySchema = z.object({ patientId: PatientIdSchema }).strict();
export type ListConsentsQuery = z.infer<typeof ListConsentsQuerySchema>;

export const ConsentDtoSchema = z
  .object({
    id: ConsentIdSchema,
    patientId: PatientIdSchema,
    consentType: ConsentTypeSchema,
    noticeVersion: z.string(),
    status: z.enum(['accepted', 'declined', 'withdrawn']),
    method: ConsentMethodSchema,
    decidedAt: z.string(),
    withdrawnAt: z.string().nullable(),
    notes: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict();
export type ConsentDto = z.infer<typeof ConsentDtoSchema>;
