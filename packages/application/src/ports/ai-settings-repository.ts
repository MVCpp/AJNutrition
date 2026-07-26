/** Single-row AI configuration. The API key is stored sealed, never plain. */
export interface AiSettingsRecord {
  enabled: boolean;
  provider: 'anthropic';
  model: string;
  /** Serialized EnvelopeV1 JSON, or null when no key is stored. */
  apiKeyEnvelope: string | null;
  updatedAt: string;
}

export interface AiSettingsRepository {
  get(): AiSettingsRecord | null;
  save(record: AiSettingsRecord): void;
}
