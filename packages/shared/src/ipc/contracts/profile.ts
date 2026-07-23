import { z } from 'zod';

/** Practitioner profile contracts (§12.1) — feeds every report header. */

export const SaveProfileCommandSchema = z
  .object({
    fullName: z.string().trim().min(1, 'required').max(200, 'too_long'),
    title: z.string().trim().max(150, 'too_long').optional(),
    license: z.string().trim().max(50, 'too_long').optional(),
    phone: z.string().trim().max(30, 'too_long').optional(),
    email: z.string().trim().email('invalid_email').max(254).optional(),
    address: z.string().trim().max(300, 'too_long').optional(),
  })
  .strict();
export type SaveProfileCommand = z.infer<typeof SaveProfileCommandSchema>;

export const ProfileDtoSchema = z
  .object({
    fullName: z.string(),
    title: z.string().nullable(),
    license: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    address: z.string().nullable(),
    hasLogo: z.boolean(),
    /** data: URL for preview; the raw bytes never cross to the renderer. */
    logoDataUrl: z.string().nullable(),
  })
  .strict();
export type ProfileDto = z.infer<typeof ProfileDtoSchema>;

export const SetLogoResultSchema = z
  .object({ canceled: z.boolean(), profile: ProfileDtoSchema.nullable() })
  .strict();
export type SetLogoResultDto = z.infer<typeof SetLogoResultSchema>;

export const ExportPlanPdfCommandSchema = z
  .object({
    planId: z.string().uuid(),
    /** ISO date of the photo session to include, or null for no photos. */
    includePhotosDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
  })
  .strict();
export type ExportPlanPdfCommand = z.infer<typeof ExportPlanPdfCommandSchema>;

export const ExportPlanPdfResultSchema = z
  .object({
    canceled: z.boolean(),
    fileName: z.string().nullable(),
    sizeBytes: z.number().int().min(0).nullable(),
  })
  .strict();
export type ExportPlanPdfResultDto = z.infer<typeof ExportPlanPdfResultSchema>;
