/**
 * Typed application error model (docs/architecture/overview.md §Error handling).
 *
 * Every error that crosses the IPC boundary is serialized to `SerializedAppError`.
 * User-facing messages must be safe: no stack traces, file paths, SQL, secrets,
 * or patient data beyond what the message strictly requires.
 */

export const ERROR_CODES = [
  'VALIDATION',
  'AUTHORIZATION',
  'NOT_FOUND',
  'CONFLICT',
  'DATABASE',
  'MIGRATION',
  'FILE',
  'IMPORT',
  'EXPORT',
  'ENCRYPTION',
  'BACKUP',
  'RESTORE',
  'NETWORK',
  'AI_PROVIDER',
  'CALCULATION',
  'DATASET',
  'UPDATE',
  'INTEGRITY',
  'UNEXPECTED',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface SerializedAppError {
  /** Stable machine-readable category. */
  code: ErrorCode;
  /** Safe, user-presentable message (localized upstream by the renderer). */
  message: string;
  /** Short support code to correlate with redacted local logs. */
  supportCode: string;
  /** Field-level validation issues, when code === 'VALIDATION'. */
  fieldErrors?: Record<string, string[]>;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly supportCode: string;
  readonly fieldErrors?: Record<string, string[]>;
  /** Internal detail for redacted logs only. Never serialized across IPC. */
  readonly internalDetail?: string;

  constructor(options: {
    code: ErrorCode;
    message: string;
    supportCode?: string;
    fieldErrors?: Record<string, string[]>;
    internalDetail?: string;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'AppError';
    this.code = options.code;
    this.supportCode = options.supportCode ?? generateSupportCode();
    if (options.fieldErrors !== undefined) this.fieldErrors = options.fieldErrors;
    if (options.internalDetail !== undefined) this.internalDetail = options.internalDetail;
  }

  serialize(): SerializedAppError {
    const out: SerializedAppError = {
      code: this.code,
      message: this.message,
      supportCode: this.supportCode,
    };
    if (this.fieldErrors) out.fieldErrors = this.fieldErrors;
    return out;
  }
}

export function generateSupportCode(): string {
  // Not a secret; short random token to correlate a UI error with local logs.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `AJN-${code}`;
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
