import { z } from 'zod';

/** Application preferences (single row). Security defaults stay conservative. */

export const AUTO_LOCK_MIN_MINUTES = 1;
export const AUTO_LOCK_MAX_MINUTES = 240;
export const AUTO_LOCK_DEFAULT_MINUTES = 10;

export const SaveAppSettingsCommandSchema = z
  .object({
    autoLockMinutes: z
      .number()
      .int()
      .min(AUTO_LOCK_MIN_MINUTES, 'out_of_range')
      .max(AUTO_LOCK_MAX_MINUTES, 'out_of_range'),
  })
  .strict();
export type SaveAppSettingsCommand = z.infer<typeof SaveAppSettingsCommandSchema>;

export const AppSettingsDtoSchema = z
  .object({ autoLockMinutes: z.number().int(), updatedAt: z.string().nullable() })
  .strict();
export type AppSettingsDto = z.infer<typeof AppSettingsDtoSchema>;
