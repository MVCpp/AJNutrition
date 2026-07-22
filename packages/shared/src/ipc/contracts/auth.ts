import { z } from 'zod';

/**
 * Authentication IPC contracts. Passphrases travel over IPC exactly once per
 * action and are never echoed back, stored, or logged.
 */

export const PassphraseSchema = z
  .string()
  .min(12, 'passphrase_too_short')
  .max(128, 'passphrase_too_long');

export const AuthStateSchema = z.enum(['setup-required', 'locked', 'unlocked']);
export type AuthState = z.infer<typeof AuthStateSchema>;

export const AuthStatusDtoSchema = z
  .object({
    state: AuthStateSchema,
    /** Seconds the user must wait before the next unlock attempt (0 = now). */
    retryDelaySeconds: z.number().int().min(0),
    failedAttempts: z.number().int().min(0),
  })
  .strict();
export type AuthStatusDto = z.infer<typeof AuthStatusDtoSchema>;

export const SetupCommandSchema = z.object({ passphrase: PassphraseSchema }).strict();
export type SetupCommand = z.infer<typeof SetupCommandSchema>;

export const SetupResultSchema = z
  .object({
    /** Shown exactly once; the app never stores it. */
    recoveryKey: z.string(),
  })
  .strict();
export type SetupResult = z.infer<typeof SetupResultSchema>;

export const UnlockCommandSchema = z.object({ passphrase: z.string().min(1).max(128) }).strict();
export type UnlockCommand = z.infer<typeof UnlockCommandSchema>;

export const RecoveryUnlockCommandSchema = z
  .object({
    recoveryKey: z.string().trim().min(10).max(100),
    /** Using the recovery key forces a passphrase reset in the same step. */
    newPassphrase: PassphraseSchema,
  })
  .strict();
export type RecoveryUnlockCommand = z.infer<typeof RecoveryUnlockCommandSchema>;

export const RecoveryUnlockResultSchema = z
  .object({
    /** A fresh recovery key — the used one is invalidated. Shown exactly once. */
    recoveryKey: z.string(),
  })
  .strict();
export type RecoveryUnlockResult = z.infer<typeof RecoveryUnlockResultSchema>;

export const EmptyCommandSchema = z.object({}).strict();
export type EmptyCommand = z.infer<typeof EmptyCommandSchema>;
