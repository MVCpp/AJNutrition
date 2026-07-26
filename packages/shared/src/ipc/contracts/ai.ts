import { z } from 'zod';
import { PatientIdSchema } from './patient';

/**
 * AI assistance contracts (Epic 7). The API key crosses INTO the main process
 * once and never comes back out: the DTO only reports whether one is stored.
 */

export const AI_MODEL_IDS = [
  'claude-sonnet-5',
  'claude-opus-5',
  'claude-haiku-4-5-20251001',
] as const;
export const AiModelSchema = z.enum(AI_MODEL_IDS);
export type AiModelId = z.infer<typeof AiModelSchema>;

export const AI_MODEL_LABELS: Record<AiModelId, string> = {
  'claude-sonnet-5': 'Claude Sonnet 5 (equilibrado)',
  'claude-opus-5': 'Claude Opus 5 (máxima calidad)',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5 (más rápido y económico)',
};

export const SaveAiSettingsCommandSchema = z
  .object({
    enabled: z.boolean(),
    model: AiModelSchema,
    /** Omit to keep the stored key; empty string deletes it. */
    apiKey: z.string().trim().max(200, 'too_long').optional(),
  })
  .strict();
export type SaveAiSettingsCommand = z.infer<typeof SaveAiSettingsCommandSchema>;

export const AiSettingsDtoSchema = z
  .object({
    enabled: z.boolean(),
    provider: z.literal('anthropic'),
    model: AiModelSchema,
    /** The key itself never crosses the IPC boundary. */
    hasApiKey: z.boolean(),
    updatedAt: z.string().nullable(),
  })
  .strict();
export type AiSettingsDto = z.infer<typeof AiSettingsDtoSchema>;

export const GenerateProgressSummaryCommandSchema = z
  .object({ patientId: PatientIdSchema })
  .strict();
export type GenerateProgressSummaryCommand = z.infer<typeof GenerateProgressSummaryCommandSchema>;

export const AiProgressSummaryDtoSchema = z
  .object({
    summary: z.string(),
    observations: z.array(z.string()),
    questions: z.array(z.string()),
    model: AiModelSchema,
    generatedAt: z.string(),
    /** Shown so the practitioner can see the cost of each request. */
    usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }).strict(),
  })
  .strict();
export type AiProgressSummaryDto = z.infer<typeof AiProgressSummaryDtoSchema>;
