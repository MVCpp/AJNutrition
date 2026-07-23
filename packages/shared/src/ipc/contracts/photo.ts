import { z } from 'zod';
import { PatientIdSchema } from './patient';

/**
 * Patient photo contracts (§12.21/§33). Body photos for progress tracking:
 * front, both sides, back. Files are encrypted at rest; adding a photo
 * requires an ACTIVE accepted 'photo' consent for the patient.
 */

export const PhotoKindSchema = z.enum(['front', 'side_left', 'side_right', 'back']);
export type PhotoKind = z.infer<typeof PhotoKindSchema>;

export const PhotoIdSchema = z.string().uuid();

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const AddPhotoCommandSchema = z
  .object({
    patientId: PatientIdSchema,
    kind: PhotoKindSchema,
    /** Session date the photo belongs to (defaults to today in the UI). */
    capturedAt: z.string().regex(ISO_DATE, 'invalid_date'),
  })
  .strict();
export type AddPhotoCommand = z.infer<typeof AddPhotoCommandSchema>;

export const ListPhotosQuerySchema = z.object({ patientId: PatientIdSchema }).strict();
export type ListPhotosQuery = z.infer<typeof ListPhotosQuerySchema>;

export const GetPhotoQuerySchema = z.object({ photoId: PhotoIdSchema }).strict();
export type GetPhotoQuery = z.infer<typeof GetPhotoQuerySchema>;

export const DeletePhotoCommandSchema = z.object({ photoId: PhotoIdSchema }).strict();
export type DeletePhotoCommand = z.infer<typeof DeletePhotoCommandSchema>;

export const PhotoDtoSchema = z
  .object({
    id: PhotoIdSchema,
    patientId: PatientIdSchema,
    kind: PhotoKindSchema,
    capturedAt: z.string().regex(ISO_DATE),
    mimeType: z.enum(['image/jpeg', 'image/png']),
    sizeBytes: z.number().int().positive(),
    createdAt: z.string(),
  })
  .strict();
export type PhotoDto = z.infer<typeof PhotoDtoSchema>;

export const AddPhotoResultSchema = z
  .object({
    canceled: z.boolean(),
    photo: PhotoDtoSchema.nullable(),
  })
  .strict();
export type AddPhotoResultDto = z.infer<typeof AddPhotoResultSchema>;

export const PhotoDataSchema = z
  .object({
    /** data: URL for direct <img> display; never a file path. */
    dataUrl: z.string().startsWith('data:image/'),
  })
  .strict();
export type PhotoDataDto = z.infer<typeof PhotoDataSchema>;
