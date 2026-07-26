import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AiModelId } from '@ajnutrition/shared';
import { AI_MODEL_IDS, AI_MODEL_LABELS } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';

/**
 * AI assistant configuration. The API key is write-only from here: it goes to
 * the main process once, is sealed at rest, and never comes back — the panel
 * only learns whether one is stored.
 */
export function AiSettingsPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState<AiModelId>('claude-sonnet-5');
  const [touchedModel, setTouchedModel] = useState(false);
  const [saved, setSaved] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ['ai-settings'],
    queryFn: () => unwrap(window.ajnutrition.ai.getSettings()),
  });
  const settings = settingsQuery.data;
  const effectiveModel = touchedModel ? model : (settings?.model ?? 'claude-sonnet-5');

  const saveMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      unwrap(
        window.ajnutrition.ai.saveSettings({
          enabled,
          model: effectiveModel,
          // Omitted entirely when untouched, so saving keeps the stored key.
          ...(apiKey.trim() === '' ? {} : { apiKey: apiKey.trim() }),
        }),
      ),
    onSuccess: async () => {
      setApiKey('');
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
    },
  });

  const clearKeyMutation = useMutation({
    mutationFn: () =>
      unwrap(
        window.ajnutrition.ai.saveSettings({ enabled: false, model: effectiveModel, apiKey: '' }),
      ),
    onSuccess: async () => {
      setApiKey('');
      setSaved(false);
      await queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
    },
  });

  const error =
    saveMutation.error instanceof ApiError
      ? saveMutation.error.message
      : clearKeyMutation.error instanceof ApiError
        ? clearKeyMutation.error.message
        : null;

  return (
    <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
      <h3 className="text-base font-semibold text-slate-800">✨ {t('ai.sectionTitle')}</h3>
      <p className="mt-1 text-sm text-slate-600">{t('ai.sectionIntro')}</p>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <p className="font-medium">{t('ai.privacyTitle')}</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>{t('ai.privacySent')}</li>
          <li>{t('ai.privacyNotSent')}</li>
          <li>{t('ai.privacyConsent')}</li>
          <li>{t('ai.privacyReview')}</li>
        </ul>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ai-key" className="mb-1 block text-sm font-medium">
            {t('ai.apiKey')}
          </label>
          <input
            id="ai-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings?.hasApiKey ? t('ai.apiKeyStored') : 'sk-ant-…'}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <p className="mt-1 text-xs text-slate-500">{t('ai.apiKeyHint')}</p>
        </div>
        <div>
          <label htmlFor="ai-model" className="mb-1 block text-sm font-medium">
            {t('ai.model')}
          </label>
          <select
            id="ai-model"
            value={effectiveModel}
            onChange={(e) => {
              setModel(e.target.value as AiModelId);
              setTouchedModel(true);
            }}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {AI_MODEL_IDS.map((id) => (
              <option key={id} value={id}>
                {AI_MODEL_LABELS[id]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => saveMutation.mutate(true)}
          disabled={saveMutation.isPending || (!settings?.hasApiKey && apiKey.trim() === '')}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {saveMutation.isPending ? t('ai.saving') : t('ai.enable')}
        </button>
        <button
          type="button"
          onClick={() => saveMutation.mutate(false)}
          disabled={saveMutation.isPending || !settings?.enabled}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {t('ai.disable')}
        </button>
        {settings?.hasApiKey && (
          <button
            type="button"
            onClick={() => clearKeyMutation.mutate()}
            disabled={clearKeyMutation.isPending}
            className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {t('ai.clearKey')}
          </button>
        )}
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            settings?.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {settings?.enabled ? t('ai.statusOn') : t('ai.statusOff')}
        </span>
        {saved && !saveMutation.isPending && (
          <span className="text-xs text-emerald-700">{t('ai.saved')}</span>
        )}
      </div>
    </div>
  );
}
