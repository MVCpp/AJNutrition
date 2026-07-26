import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AUTO_LOCK_MAX_MINUTES, AUTO_LOCK_MIN_MINUTES } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';

/** Presets that cover the realistic range without free-typing every time. */
const PRESETS = [1, 5, 10, 15, 30, 60] as const;

export function SettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [minutes, setMinutes] = useState('10');
  const [saved, setSaved] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => unwrap(window.ajnutrition.settings.get()),
  });

  useEffect(() => {
    if (settingsQuery.data) setMinutes(String(settingsQuery.data.autoLockMinutes));
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (value: number) =>
      unwrap(window.ajnutrition.settings.save({ autoLockMinutes: value })),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ['app-settings'] });
    },
  });

  const parsed = Number(minutes.trim());
  const valid =
    Number.isInteger(parsed) && parsed >= AUTO_LOCK_MIN_MINUTES && parsed <= AUTO_LOCK_MAX_MINUTES;
  const error = saveMutation.error instanceof ApiError ? saveMutation.error.message : null;

  return (
    <section aria-labelledby="settings-heading">
      <div className="mb-6">
        <h2 id="settings-heading" className="text-lg font-semibold">
          {t('settings.heading')}
        </h2>
        <p className="text-sm text-slate-500">{t('settings.intro')}</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-base font-semibold text-slate-800">🔒 {t('settings.securityTitle')}</h3>
        <p className="mt-1 text-sm text-slate-600">{t('settings.autoLockHint')}</p>

        {error && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="auto-lock" className="mb-1 block text-sm font-medium">
              {t('settings.autoLockLabel')}
            </label>
            <div className="relative w-40">
              <input
                id="auto-lock"
                type="text"
                inputMode="numeric"
                value={minutes}
                onChange={(e) => {
                  setMinutes(e.target.value);
                  setSaved(false);
                }}
                className="w-full rounded-md border border-slate-300 py-2 pl-3 pr-14 text-right text-sm tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">
                min
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => saveMutation.mutate(parsed)}
            disabled={!valid || saveMutation.isPending}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {saveMutation.isPending ? t('settings.saving') : t('settings.save')}
          </button>
          {saved && !saveMutation.isPending && (
            <span className="text-xs text-emerald-700">{t('settings.saved')}</span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setMinutes(String(preset));
                setSaved(false);
              }}
              className={
                parsed === preset
                  ? 'rounded-full bg-emerald-700 px-3 py-1 text-xs font-medium text-white'
                  : 'rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100'
              }
            >
              {t('settings.presetMinutes', { count: preset })}
            </button>
          ))}
        </div>

        {!valid && minutes.trim() !== '' && (
          <p className="mt-2 text-xs text-red-700">
            {t('settings.autoLockRange', {
              min: AUTO_LOCK_MIN_MINUTES,
              max: AUTO_LOCK_MAX_MINUTES,
            })}
          </p>
        )}

        <ul className="mt-4 list-inside list-disc space-y-1 text-xs text-slate-500">
          <li>{t('settings.alwaysLockOsLock')}</li>
          <li>{t('settings.alwaysLockQuit')}</li>
        </ul>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-base font-semibold text-slate-800">💾 {t('settings.backupTitle')}</h3>
        {/* Restoring replaces the live database, so it is only offered from
            the lock screen — there is nothing to restore *into* while open. */}
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-600">
          <li>{t('settings.backupCreate')}</li>
          <li>{t('settings.backupRestore')}</li>
        </ul>
      </div>
    </section>
  );
}
