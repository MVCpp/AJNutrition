import { z } from 'zod';
import { AppError } from '@ajnutrition/shared';

/**
 * Provider abstraction. The rest of the app depends on this interface, never
 * on a vendor SDK, so a second provider (or a fully local model) is a new
 * implementation rather than a rewrite.
 */

export interface AiRequest {
  system: string;
  userMessage: string;
  maxTokens: number;
}

export interface AiResponse {
  text: string;
  /** Token counts for cost visibility; never contains prompt content. */
  usage: { inputTokens: number; outputTokens: number };
}

export interface AiProvider {
  readonly id: string;
  complete(request: AiRequest): Promise<AiResponse>;
}

/** Models offered in the UI. Kept explicit so an unknown id cannot be sent. */
export const AI_MODELS = ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5-20251001'] as const;
export type AiModel = (typeof AI_MODELS)[number];

const AnthropicResponseSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
});

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Anthropic Messages API over plain fetch — this runs in the MAIN process
 * only, so the renderer CSP stays `connect-src 'self'` and the API key never
 * crosses the IPC boundary.
 */
export class AnthropicProvider implements AiProvider {
  readonly id = 'anthropic';

  constructor(
    private readonly apiKey: string,
    private readonly model: AiModel,
    private readonly timeoutMs = 60_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async complete(request: AiRequest): Promise<AiResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: [{ role: 'user', content: request.userMessage }],
        }),
        signal: controller.signal,
      });
    } catch (cause) {
      throw new AppError({
        code: 'NETWORK',
        message:
          'No fue posible contactar al proveedor de IA. Revise su conexión a internet e intente de nuevo.',
        internalDetail: `anthropic request failed: ${String(cause)}`,
        cause,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // The body can echo request content; it is never surfaced or logged.
      throw new AppError({
        code: response.status === 401 || response.status === 403 ? 'AUTHORIZATION' : 'AI_PROVIDER',
        message:
          response.status === 401 || response.status === 403
            ? 'El proveedor de IA rechazó la clave de API. Verifíquela en Perfil.'
            : `El proveedor de IA respondió con un error (${response.status}). Intente más tarde.`,
        internalDetail: `anthropic http ${response.status}`,
      });
    }

    const parsed = AnthropicResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new AppError({
        code: 'AI_PROVIDER',
        message: 'La respuesta del proveedor de IA no tuvo el formato esperado.',
        internalDetail: 'anthropic response failed schema validation',
      });
    }
    const text = parsed.data.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
      .trim();
    return {
      text,
      usage: {
        inputTokens: parsed.data.usage.input_tokens,
        outputTokens: parsed.data.usage.output_tokens,
      },
    };
  }
}
