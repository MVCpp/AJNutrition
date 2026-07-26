export interface AppSettingsRecord {
  autoLockMinutes: number;
  updatedAt: string;
}

export interface AppSettingsRepository {
  get(): AppSettingsRecord | null;
  save(record: AppSettingsRecord): void;
}
