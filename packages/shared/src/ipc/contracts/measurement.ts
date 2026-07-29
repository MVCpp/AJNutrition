import { z } from 'zod';
import { PatientIdSchema } from './patient';

/** Anthropometric measurement contracts (§12.7). Raw values in metric units. */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const positive = z.number().finite().positive();

export const CreateMeasurementCommandSchema = z
  .object({
    patientId: PatientIdSchema,
    measuredAt: z.string().regex(ISO_DATE, 'invalid_date'),
    weightKg: positive.optional(),
    heightCm: positive.optional(),
    waistCm: positive.optional(),
    hipCm: positive.optional(),
    bodyFatPercent: positive.optional(),
    /** Skinfolds in mm (Durnin-Womersley 4-site / Jackson-Pollock 3-site). */
    skinfoldBicepsMm: positive.optional(),
    skinfoldTricepsMm: positive.optional(),
    skinfoldSubscapularMm: positive.optional(),
    skinfoldSuprailiacMm: positive.optional(),
    skinfoldChestMm: positive.optional(),
    skinfoldAbdomenMm: positive.optional(),
    skinfoldThighMm: positive.optional(),
    /** Body composition captured verbatim from a BIA device (InBody etc.). */
    skeletalMuscleMassKg: positive.optional(),
    fatMassKg: positive.optional(),
    fatFreeMassKg: positive.optional(),
    totalBodyWaterL: positive.optional(),
    proteinKg: positive.optional(),
    mineralsKg: positive.optional(),
    visceralFatLevel: positive.optional(),
    deviceBmrKcal: positive.optional(),
    smiKgM2: positive.optional(),
    biaScore: positive.optional(),
    /**
     * Clinical context for Ireton-Jones (ventilated variant). Frozen into the
     * calculated result's inputs; other formulas ignore it.
     */
    clinicalFlags: z
      .object({
        ventilated: z.boolean(),
        trauma: z.boolean(),
        burn: z.boolean(),
      })
      .strict()
      .optional(),
    consultationId: z.string().uuid().optional(),
    notes: z.string().trim().max(2000, 'too_long').optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.weightKg !== undefined ||
      v.heightCm !== undefined ||
      v.waistCm !== undefined ||
      v.hipCm !== undefined ||
      v.bodyFatPercent !== undefined ||
      v.skinfoldBicepsMm !== undefined ||
      v.skinfoldTricepsMm !== undefined ||
      v.skinfoldSubscapularMm !== undefined ||
      v.skinfoldSuprailiacMm !== undefined ||
      v.skinfoldChestMm !== undefined ||
      v.skinfoldAbdomenMm !== undefined ||
      v.skinfoldThighMm !== undefined ||
      v.skeletalMuscleMassKg !== undefined ||
      v.fatMassKg !== undefined ||
      v.fatFreeMassKg !== undefined ||
      v.totalBodyWaterL !== undefined ||
      v.proteinKg !== undefined ||
      v.mineralsKg !== undefined ||
      v.visceralFatLevel !== undefined ||
      v.deviceBmrKcal !== undefined ||
      v.smiKgM2 !== undefined ||
      v.biaScore !== undefined,
    { message: 'at_least_one_measurement' },
  );
export type CreateMeasurementCommand = z.infer<typeof CreateMeasurementCommandSchema>;

export const ListMeasurementsQuerySchema = z.object({ patientId: PatientIdSchema }).strict();
export type ListMeasurementsQuery = z.infer<typeof ListMeasurementsQuerySchema>;

export const CalculatedValueDtoSchema = z
  .object({
    formulaId: z.string(),
    formulaName: z.string(),
    formulaVersion: z.number().int().min(1),
    roundedResult: z.number(),
    unit: z.string(),
    warnings: z.array(z.string()),
  })
  .strict();
export type CalculatedValueDto = z.infer<typeof CalculatedValueDtoSchema>;

export const MeasurementSessionDtoSchema = z
  .object({
    id: z.string().uuid(),
    patientId: PatientIdSchema,
    measuredAt: z.string().regex(ISO_DATE),
    weightKg: z.number().nullable(),
    heightCm: z.number().nullable(),
    waistCm: z.number().nullable(),
    hipCm: z.number().nullable(),
    bodyFatPercent: z.number().nullable(),
    skinfoldBicepsMm: z.number().nullable(),
    skinfoldTricepsMm: z.number().nullable(),
    skinfoldSubscapularMm: z.number().nullable(),
    skinfoldSuprailiacMm: z.number().nullable(),
    skinfoldChestMm: z.number().nullable(),
    skinfoldAbdomenMm: z.number().nullable(),
    skinfoldThighMm: z.number().nullable(),
    skeletalMuscleMassKg: z.number().nullable(),
    fatMassKg: z.number().nullable(),
    fatFreeMassKg: z.number().nullable(),
    totalBodyWaterL: z.number().nullable(),
    proteinKg: z.number().nullable(),
    mineralsKg: z.number().nullable(),
    visceralFatLevel: z.number().nullable(),
    deviceBmrKcal: z.number().nullable(),
    smiKgM2: z.number().nullable(),
    biaScore: z.number().nullable(),
    consultationId: z.string().uuid().nullable(),
    calculated: z.array(CalculatedValueDtoSchema),
    notes: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict();
export type MeasurementSessionDto = z.infer<typeof MeasurementSessionDtoSchema>;

/** Patient-facing progress report; the main process opens the save dialog. */
export const ExportProgressReportCommandSchema = z.object({ patientId: PatientIdSchema }).strict();
export type ExportProgressReportCommand = z.infer<typeof ExportProgressReportCommandSchema>;

export const ExportProgressReportResultDtoSchema = z
  .object({
    canceled: z.boolean(),
    fileName: z.string().nullable(),
    sizeBytes: z.number().int().nullable(),
  })
  .strict();
export type ExportProgressReportResultDto = z.infer<typeof ExportProgressReportResultDtoSchema>;

/**
 * A stored result today's engine would compute differently. Reported, never
 * applied: historical results keep the version that produced them.
 */
export const FormulaDriftDtoSchema = z
  .object({
    patientId: PatientIdSchema,
    patientFileNumber: z.number().int(),
    sessionId: z.string().uuid(),
    measuredAt: z.string(),
    formulaId: z.string(),
    formulaName: z.string(),
    storedVersion: z.number().int(),
    storedResult: z.number(),
    currentVersion: z.number().int(),
    currentResult: z.number(),
    unit: z.string(),
  })
  .strict();
export type FormulaDriftDto = z.infer<typeof FormulaDriftDtoSchema>;
