import { z } from 'zod';
import { AppError } from '@ajnutrition/shared';
import type { AiProvider } from './provider';
import { buildProgressSummaryPrompt, PROGRESS_SUMMARY_SYSTEM } from './prompts';
import { assertDeidentified, type DeidentifiedContext } from './redaction';

/**
 * Model output is untrusted input: parsed against a strict schema before it is
 * allowed anywhere near the UI (ADR-0008). Anything that does not fit the
 * shape is an error, never a best-effort render.
 */
export const ProgressSummarySchema = z
  .object({
    summary: z.string().trim().min(1).max(2000),
    observations: z.array(z.string().trim().min(1).max(500)).max(8),
    questions: z.array(z.string().trim().min(1).max(300)).max(6),
  })
  .strict();
export type ProgressSummary = z.infer<typeof ProgressSummarySchema>;

/** Strips a ```json fence if the model wrapped its answer in one. */
function unwrapJson(text: string): string {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text.trim());
  return (fenced?.[1] ?? text).trim();
}

export async function generateProgressSummary(
  provider: AiProvider,
  context: DeidentifiedContext,
  forbiddenTerms: readonly string[],
): Promise<{ summary: ProgressSummary; usage: { inputTokens: number; outputTokens: number } }> {
  const userMessage = buildProgressSummaryPrompt(context);
  // Egress gate: nothing leaves the machine until this passes.
  assertDeidentified(userMessage, forbiddenTerms);

  const response = await provider.complete({
    system: PROGRESS_SUMMARY_SYSTEM,
    userMessage,
    maxTokens: 1024,
  });

  let json: unknown;
  try {
    json = JSON.parse(unwrapJson(response.text));
  } catch {
    throw new AppError({
      code: 'AI_PROVIDER',
      message: 'La respuesta de la IA no pudo interpretarse. Intente de nuevo.',
      internalDetail: 'ai summary response was not valid JSON',
    });
  }
  const parsed = ProgressSummarySchema.safeParse(json);
  if (!parsed.success) {
    throw new AppError({
      code: 'AI_PROVIDER',
      message: 'La respuesta de la IA no tuvo el formato esperado. Intente de nuevo.',
      internalDetail: 'ai summary response failed schema validation',
    });
  }
  return { summary: parsed.data, usage: response.usage };
}
