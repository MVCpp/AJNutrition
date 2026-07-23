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
    notes: z.string().trim().max(2000, 'too_long').optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.weightKg !== undefined ||
      v.heightCm !== undefined ||
      v.waistCm !== undefined ||
      v.hipCm !== undefined ||
      v.bodyFatPercent !== undefined,
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
    calculated: z.array(CalculatedValueDtoSchema),
    notes: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict();
export type MeasurementSessionDto = z.infer<typeof MeasurementSessionDtoSchema>;
