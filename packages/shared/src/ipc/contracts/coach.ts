import { z } from 'zod';
import { PatientDtoSchema, PatientIdSchema } from './patient';
import { ConsentMethodSchema as ConsentMethodForShareSchema } from './consent';

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

/**
 * Sharing authorisations (C-2).
 *
 * A grant is what actually permits sending a coach anything, and it cannot
 * exist without the patient's express `third_party_transfer` consent. The
 * scope is enumerated: everything absent from `ShareScopeSchema` is absent on
 * purpose and cannot be shared by any combination of flags.
 */
export const CoachShareGrantIdSchema = z.string().uuid();

export const ShareScopeSchema = z
  .object({
    measurements: z.boolean(),
    bodyComposition: z.boolean(),
    planTargets: z.boolean(),
    adherence: z.boolean(),
    /** Body photos to a non-clinical third party. Defaults off, always. */
    photos: z.boolean(),
  })
  .strict();
export type ShareScopeDto = z.infer<typeof ShareScopeSchema>;

export const GrantCoachShareCommandSchema = z
  .object({
    linkId: CoachLinkIdSchema,
    /** The accepted third_party_transfer consent that authorises this. */
    consentId: z.string().uuid(),
    scope: ShareScopeSchema,
  })
  .strict();
export type GrantCoachShareCommand = z.infer<typeof GrantCoachShareCommandSchema>;

export const RevokeCoachShareCommandSchema = z
  .object({
    grantId: CoachShareGrantIdSchema,
    reason: z.string().trim().max(500, 'too_long').optional(),
  })
  .strict();
export type RevokeCoachShareCommand = z.infer<typeof RevokeCoachShareCommandSchema>;

export const ListCoachSharesQuerySchema = z.object({ patientId: PatientIdSchema }).strict();
export type ListCoachSharesQuery = z.infer<typeof ListCoachSharesQuerySchema>;

export const ShareIneffectiveReasonSchema = z.enum([
  'grant_revoked',
  'link_revoked',
  'consent_missing',
  'consent_wrong_type',
  'consent_wrong_patient',
  'consent_not_accepted',
]);
export type ShareIneffectiveReason = z.infer<typeof ShareIneffectiveReasonSchema>;

export const CoachShareGrantDtoSchema = z
  .object({
    id: CoachShareGrantIdSchema,
    linkId: CoachLinkIdSchema,
    consentId: z.string().uuid(),
    coachId: CoachIdSchema,
    coachDisplayName: z.string(),
    /** What was granted, as recorded. Not what may be shared right now. */
    scope: ShareScopeSchema,
    /**
     * What may actually be shared right now. Empty whenever `effective` is
     * false, so reading this without checking still yields nothing.
     */
    effectiveScope: ShareScopeSchema,
    effective: z.boolean(),
    reason: ShareIneffectiveReasonSchema.nullable(),
    grantedAt: z.string(),
    revokedAt: z.string().nullable(),
    revokedReason: z.string().nullable(),
  })
  .strict();
export type CoachShareGrantDto = z.infer<typeof CoachShareGrantDtoSchema>;

/** A consent that could authorise a new grant: accepted, and not yet spent. */
export const EligibleConsentDtoSchema = z
  .object({
    consentId: z.string().uuid(),
    noticeVersion: z.string(),
    method: ConsentMethodForShareSchema,
    decidedAt: z.string(),
  })
  .strict();
export type EligibleConsentDto = z.infer<typeof EligibleConsentDtoSchema>;

/** Everything the patient's sharing panel needs, in one call. */
export const PatientSharingDtoSchema = z
  .object({
    grants: z.array(CoachShareGrantDtoSchema),
    eligibleConsents: z.array(EligibleConsentDtoSchema),
  })
  .strict();
export type PatientSharingDto = z.infer<typeof PatientSharingDtoSchema>;

/**
 * The coach report (C-3).
 *
 * The data is filtered by scope in the APPLICATION layer, not at render time,
 * so an out-of-scope value never reaches this DTO in the first place. There is
 * no field here a renderer could accidentally widen.
 */
export const CoachReportMetricDtoSchema = z
  .object({
    label: z.string(),
    decimals: z.number().int(),
    points: z.array(z.object({ date: z.string(), value: z.number() }).strict()),
  })
  .strict();
export type CoachReportMetricDto = z.infer<typeof CoachReportMetricDtoSchema>;

export const CoachReportDataDtoSchema = z
  .object({
    patientId: PatientIdSchema,
    patientName: z.string(),
    patientFileNumber: z.number().int().positive(),
    coachName: z.string(),
    /** Stamped onto the document so a forwarded copy still explains itself. */
    consentNoticeVersion: z.string(),
    consentDecidedAt: z.string(),
    scope: ShareScopeSchema,
    scopeLabels: z.array(z.string()),
    metrics: z.array(CoachReportMetricDtoSchema),
    planTargets: z.object({ energyKcal: z.number(), proteinG: z.number() }).strict().nullable(),
    adherence: z.array(z.object({ recordedAt: z.string(), score: z.number() }).strict()),
    /**
     * Present only when photos are in scope. Metadata is chosen here so the
     * main process only ever fetches BYTES for ids the grant allowed — it
     * cannot widen the set.
     */
    photos: z.array(
      z.object({ id: z.string().uuid(), kind: z.string(), capturedAt: z.string() }).strict(),
    ),
    sessionCount: z.number().int().nonnegative(),
  })
  .strict();
export type CoachReportDataDto = z.infer<typeof CoachReportDataDtoSchema>;

export const ExportCoachReportCommandSchema = z.object({ linkId: CoachLinkIdSchema }).strict();
export type ExportCoachReportCommand = z.infer<typeof ExportCoachReportCommandSchema>;

export const ExportCoachPackCommandSchema = z.object({ coachId: CoachIdSchema }).strict();
export type ExportCoachPackCommand = z.infer<typeof ExportCoachPackCommandSchema>;

/**
 * A trainee left out of a pack, and why. Never silent: a batch that quietly
 * skipped someone reads as "everyone was included".
 */
export const CoachPackSkipDtoSchema = z
  .object({
    patientName: z.string(),
    reason: z.union([ShareIneffectiveReasonSchema, z.literal('no_authorisation')]),
  })
  .strict();
export type CoachPackSkipDto = z.infer<typeof CoachPackSkipDtoSchema>;

export const CoachPackResultDtoSchema = z
  .object({
    canceled: z.boolean(),
    folderName: z.string().nullable(),
    written: z.array(z.string()),
    skipped: z.array(CoachPackSkipDtoSchema),
  })
  .strict();
export type CoachPackResultDto = z.infer<typeof CoachPackResultDtoSchema>;
