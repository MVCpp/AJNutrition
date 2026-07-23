import { z } from 'zod';
import { PatientIdSchema } from './patient';

/**
 * Patient export contracts (§23.1). The export document itself is written to
 * disk by the main process — only the request and a result summary cross IPC.
 */

export const ExportPatientCommandSchema = z.object({ patientId: PatientIdSchema }).strict();
export type ExportPatientCommand = z.infer<typeof ExportPatientCommandSchema>;

export const ExportPatientResultSchema = z
  .object({
    canceled: z.boolean(),
    fileName: z.string().nullable(),
    sizeBytes: z.number().int().min(0).nullable(),
  })
  .strict();
export type ExportPatientResultDto = z.infer<typeof ExportPatientResultSchema>;

export const PATIENT_EXPORT_FORMAT = 'ajnutrition-patient-export';
export const PATIENT_EXPORT_FORMAT_VERSION = 1;
