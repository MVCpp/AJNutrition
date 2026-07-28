export interface AppSettingsRecord {
  autoLockMinutes: number;
  autoBackupEnabled: boolean;
  /** Absolute folder path chosen through a native dialog; null = never chosen. */
  autoBackupFolder: string | null;
  /** How many automatic backup files to retain in that folder. */
  autoBackupKeep: number;
  lastAutoBackupAt: string | null;
  /** Desktop reminder for an upcoming appointment (privacy-safe: no names). */
  remindersEnabled: boolean;
  reminderMinutes: number;
  updatedAt: string;
}

export interface AppSettingsRepository {
  get(): AppSettingsRecord | null;
  save(record: AppSettingsRecord): void;
  /**
   * Stamps the last successful automatic run without touching preferences —
   * bookkeeping, not a user decision, so it must not move `updatedAt`.
   */
  markAutoBackupRun(at: string): void;
}
