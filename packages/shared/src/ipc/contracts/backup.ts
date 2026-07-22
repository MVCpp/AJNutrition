import { z } from 'zod';

/**
 * Backup IPC contracts. The renderer NEVER handles file paths: the main
 * process opens native dialogs itself and hands back an opaque single-use
 * token for the preview → restore two-step.
 */

export const CreateBackupCommandSchema = z
  .object({ description: z.string().trim().max(200).optional() })
  .strict();
export type CreateBackupCommand = z.infer<typeof CreateBackupCommandSchema>;

export const CreateBackupResultSchema = z
  .object({
    canceled: z.boolean(),
    fileName: z.string().nullable(),
    sizeBytes: z.number().int().min(0).nullable(),
    createdAt: z.string().nullable(),
  })
  .strict();
export type CreateBackupResultDto = z.infer<typeof CreateBackupResultSchema>;

export const PreviewBackupResultSchema = z
  .object({
    canceled: z.boolean(),
    token: z.string().uuid().nullable(),
    fileName: z.string().nullable(),
    createdAt: z.string().nullable(),
    appVersion: z.string().nullable(),
    schemaVersion: z.number().int().nullable(),
    description: z.string().nullable(),
    sizeBytes: z.number().int().nullable(),
  })
  .strict();
export type PreviewBackupResultDto = z.infer<typeof PreviewBackupResultSchema>;

export const RestoreBackupCommandSchema = z
  .object({
    /** Token issued by the preview step — never a file path. */
    token: z.string().uuid(),
    passphrase: z.string().min(1).max(128),
  })
  .strict();
export type RestoreBackupCommand = z.infer<typeof RestoreBackupCommandSchema>;

export const RestoreBackupResultSchema = z.object({ backupCreatedAt: z.string() }).strict();
export type RestoreBackupResultDto = z.infer<typeof RestoreBackupResultSchema>;
