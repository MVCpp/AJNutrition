import { AppError } from '@ajnutrition/shared';
import type { DomainContext } from '../common/context';
import { parseIsoDate } from '../patient/patient';

export type PhotoKind = 'front' | 'side_left' | 'side_right' | 'back';
export type PhotoMimeType = 'image/jpeg' | 'image/png';

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** Patient body photo metadata (the encrypted bytes live in PhotoStorage). */
export interface PatientPhoto {
  readonly id: string;
  readonly patientId: string;
  readonly kind: PhotoKind;
  readonly capturedAt: string;
  readonly originalFileName: string;
  readonly mimeType: PhotoMimeType;
  readonly sizeBytes: number;
  readonly sha256: string;
  /** Random internal name — never derived from user input (§33). */
  readonly storageName: string;
  readonly createdAt: string;
}

/**
 * Content sniffing (§33: never trust extensions or claimed MIME types).
 * Only formats we can positively identify by magic bytes are accepted.
 */
export function detectImageMime(bytes: Uint8Array): PhotoMimeType | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length > png.length && png.every((value, index) => bytes[index] === value)) {
    return 'image/png';
  }
  return null;
}

export function createPatientPhoto(
  input: {
    patientId: string;
    kind: PhotoKind;
    capturedAt: string;
    originalFileName: string;
    bytes: Uint8Array;
    sha256: string;
  },
  ctx: DomainContext,
): PatientPhoto {
  if (input.bytes.length === 0 || input.bytes.length > MAX_PHOTO_BYTES) {
    throw new AppError({
      code: 'VALIDATION',
      message: `La imagen debe pesar entre 1 byte y ${MAX_PHOTO_BYTES / (1024 * 1024)} MB.`,
      fieldErrors: { file: ['invalid_size'] },
    });
  }
  const mimeType = detectImageMime(input.bytes);
  if (mimeType === null) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'El archivo no es una imagen JPEG o PNG válida.',
      fieldErrors: { file: ['invalid_image'] },
    });
  }
  const captured = parseIsoDate(input.capturedAt);
  if (captured === null || captured.getTime() > ctx.now().getTime()) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'La fecha de la fotografía no es válida.',
      fieldErrors: { capturedAt: ['invalid_date'] },
    });
  }
  return {
    id: ctx.newId(),
    patientId: input.patientId,
    kind: input.kind,
    capturedAt: input.capturedAt,
    originalFileName: input.originalFileName.slice(0, 255),
    mimeType,
    sizeBytes: input.bytes.length,
    sha256: input.sha256,
    storageName: ctx.newId(),
    createdAt: ctx.now().toISOString(),
  };
}
