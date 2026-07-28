import { z } from 'zod';

/** Application preferences (single row). Security defaults stay conservative. */

export const AUTO_LOCK_MIN_MINUTES = 1;
export const AUTO_LOCK_MAX_MINUTES = 240;
export const AUTO_LOCK_DEFAULT_MINUTES = 10;

export const AUTO_BACKUP_MIN_KEEP = 1;
export const AUTO_BACKUP_MAX_KEEP = 60;
export const AUTO_BACKUP_DEFAULT_KEEP = 7;

export const REMINDER_MIN_MINUTES = 1;
export const REMINDER_MAX_MINUTES = 120;
export const REMINDER_DEFAULT_MINUTES = 15;

/**
 * Every field is optional: this is a PATCH, merged over the stored row by the
 * use case. A settings screen that has not finished loading can therefore
 * never clobber a preference it does not know about yet.
 *
 * The backup folder is deliberately absent — the renderer must not be able to
 * name an arbitrary write destination. It is set only through the native
 * folder dialog (settings.chooseBackupFolder).
 */
export const SaveAppSettingsCommandSchema = z
  .object({
    autoLockMinutes: z
      .number()
      .int()
      .min(AUTO_LOCK_MIN_MINUTES, 'out_of_range')
      .max(AUTO_LOCK_MAX_MINUTES, 'out_of_range')
      .optional(),
    autoBackupEnabled: z.boolean().optional(),
    autoBackupKeep: z
      .number()
      .int()
      .min(AUTO_BACKUP_MIN_KEEP, 'out_of_range')
      .max(AUTO_BACKUP_MAX_KEEP, 'out_of_range')
      .optional(),
    remindersEnabled: z.boolean().optional(),
    reminderMinutes: z
      .number()
      .int()
      .min(REMINDER_MIN_MINUTES, 'out_of_range')
      .max(REMINDER_MAX_MINUTES, 'out_of_range')
      .optional(),
  })
  .strict();
export type SaveAppSettingsCommand = z.infer<typeof SaveAppSettingsCommandSchema>;

export const AppSettingsDtoSchema = z
  .object({
    autoLockMinutes: z.number().int(),
    autoBackupEnabled: z.boolean(),
    /** Absolute path chosen by the practitioner in a native dialog; null = unset. */
    autoBackupFolder: z.string().nullable(),
    autoBackupKeep: z.number().int(),
    lastAutoBackupAt: z.string().nullable(),
    remindersEnabled: z.boolean(),
    reminderMinutes: z.number().int(),
    updatedAt: z.string().nullable(),
  })
  .strict();
export type AppSettingsDto = z.infer<typeof AppSettingsDtoSchema>;

export const ChooseBackupFolderResultDtoSchema = z
  .object({ canceled: z.boolean(), settings: AppSettingsDtoSchema })
  .strict();
export type ChooseBackupFolderResultDto = z.infer<typeof ChooseBackupFolderResultDtoSchema>;
