import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  AUTO_BACKUP_MAX_KEEP,
  AUTO_BACKUP_MIN_KEEP,
  AUTO_LOCK_MAX_MINUTES,
  AUTO_LOCK_MIN_MINUTES,
  REMINDER_MAX_MINUTES,
  REMINDER_MIN_MINUTES,
  type SaveAppSettingsCommand,
} from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';

/** Presets that cover the realistic range without free-typing every time. */
const PRESETS = [1, 5, 10, 15, 30, 60] as const;
const SETTINGS_KEY = ['app-settings'] as const;

export function SettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [minutes, setMinutes] = useState('10');
  const [keep, setKeep] = useState('7');
  const [autoBackup, setAutoBackup] = useState(false);
  const [reminders, setReminders] = useState(true);
  const [reminderMinutes, setReminderMinutes] = useState('15');
  const [savedCard, setSavedCard] = useState<'security' | 'backup' | 'reminders' | null>(null);

  const settingsQuery = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => unwrap(window.ajnutrition.settings.get()),
  });
  const settings = settingsQuery.data;

  useEffect(() => {
    if (!settings) return;
    setMinutes(String(settings.autoLockMinutes));
    setKeep(String(settings.autoBackupKeep));
    setAutoBackup(settings.autoBackupEnabled);
    setReminders(settings.remindersEnabled);
    setReminderMinutes(String(settings.reminderMinutes));
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (command: SaveAppSettingsCommand) =>
      unwrap(window.ajnutrition.settings.save(command)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });

  const folderMutation = useMutation({
    mutationFn: () => unwrap(window.ajnutrition.settings.chooseBackupFolder()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });

  const parsed = Number(minutes.trim());
  const validMinutes =
    Number.isInteger(parsed) && parsed >= AUTO_LOCK_MIN_MINUTES && parsed <= AUTO_LOCK_MAX_MINUTES;
  const parsedKeep = Number(keep.trim());
  const validKeep =
    Number.isInteger(parsedKeep) &&
    parsedKeep >= AUTO_BACKUP_MIN_KEEP &&
    parsedKeep <= AUTO_BACKUP_MAX_KEEP;
  const folder = settings?.autoBackupFolder ?? null;

  const error =
    saveMutation.error instanceof ApiError
      ? saveMutation.error.message
      : folderMutation.error instanceof ApiError
        ? folderMutation.error.message
        : null;

  const parsedReminder = Number(reminderMinutes.trim());
  const validReminder =
    Number.isInteger(parsedReminder) &&
    parsedReminder >= REMINDER_MIN_MINUTES &&
    parsedReminder <= REMINDER_MAX_MINUTES;

  const save = (card: 'security' | 'backup' | 'reminders', command: SaveAppSettingsCommand) => {
    setSavedCard(null);
    saveMutation.mutate(command, { onSuccess: () => setSavedCard(card) });
  };

  return (
    <section aria-labelledby="settings-heading">
      <div className="mb-6">
        <h2 id="settings-heading" className="text-lg font-semibold">
          {t('settings.heading')}
        </h2>
        <p className="text-sm text-slate-500">{t('settings.intro')}</p>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-base font-semibold text-slate-800">🔒 {t('settings.securityTitle')}</h3>
        <p className="mt-1 text-sm text-slate-600">{t('settings.autoLockHint')}</p>

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
                  setSavedCard(null);
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
            onClick={() => save('security', { autoLockMinutes: parsed })}
            disabled={!validMinutes || saveMutation.isPending}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {saveMutation.isPending ? t('settings.saving') : t('settings.save')}
          </button>
          {savedCard === 'security' && !saveMutation.isPending && (
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
                setSavedCard(null);
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

        {!validMinutes && minutes.trim() !== '' && (
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

        <div className="mt-4 rounded-lg bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-900">⚠️ {t('settings.lockDataTitle')}</p>
          <p className="mt-1 text-xs text-amber-800">{t('settings.lockDataHint')}</p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-base font-semibold text-slate-800">
          🗓️ {t('settings.autoBackupTitle')}
        </h3>
        <p className="mt-1 text-sm text-slate-600">{t('settings.autoBackupHint')}</p>

        <div className="mt-4">
          <p className="text-sm font-medium">{t('settings.autoBackupFolder')}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <code className="max-w-full truncate rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
              {folder ?? t('settings.autoBackupFolderNone')}
            </code>
            <button
              type="button"
              onClick={() => folderMutation.mutate()}
              disabled={folderMutation.isPending}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              📁 {t('settings.autoBackupChoose')}
            </button>
          </div>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoBackup}
            disabled={folder === null}
            onChange={(e) => {
              setAutoBackup(e.target.checked);
              setSavedCard(null);
            }}
            className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500"
          />
          {t('settings.autoBackupEnable')}
        </label>
        {folder === null && (
          <p className="mt-1 text-xs text-slate-500">{t('settings.autoBackupChooseFirst')}</p>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="auto-backup-keep" className="mb-1 block text-sm font-medium">
              {t('settings.autoBackupKeepLabel')}
            </label>
            <input
              id="auto-backup-keep"
              type="text"
              inputMode="numeric"
              value={keep}
              onChange={(e) => {
                setKeep(e.target.value);
                setSavedCard(null);
              }}
              className="w-24 rounded-md border border-slate-300 px-3 py-2 text-right text-sm tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <button
            type="button"
            onClick={() =>
              save('backup', { autoBackupEnabled: autoBackup, autoBackupKeep: parsedKeep })
            }
            disabled={!validKeep || saveMutation.isPending}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {saveMutation.isPending ? t('settings.saving') : t('settings.save')}
          </button>
          {savedCard === 'backup' && !saveMutation.isPending && (
            <span className="text-xs text-emerald-700">{t('settings.saved')}</span>
          )}
        </div>
        {!validKeep && keep.trim() !== '' && (
          <p className="mt-2 text-xs text-red-700">
            {t('settings.autoBackupKeepRange', {
              min: AUTO_BACKUP_MIN_KEEP,
              max: AUTO_BACKUP_MAX_KEEP,
            })}
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">{t('settings.autoBackupKeepHint')}</p>
        <p className="mt-3 text-xs text-slate-600">
          {settings?.lastAutoBackupAt
            ? t('settings.autoBackupLast', {
                when: new Date(settings.lastAutoBackupAt).toLocaleString('es-MX'),
              })
            : t('settings.autoBackupLastNever')}
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-base font-semibold text-slate-800">
          🔔 {t('settings.remindersTitle')}
        </h3>
        <p className="mt-1 text-sm text-slate-600">{t('settings.remindersHint')}</p>

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={reminders}
            onChange={(e) => {
              setReminders(e.target.checked);
              setSavedCard(null);
            }}
            className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500"
          />
          {t('settings.remindersEnable')}
        </label>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="reminder-minutes" className="mb-1 block text-sm font-medium">
              {t('settings.reminderMinutesLabel')}
            </label>
            <div className="relative w-32">
              <input
                id="reminder-minutes"
                type="text"
                inputMode="numeric"
                value={reminderMinutes}
                onChange={(e) => {
                  setReminderMinutes(e.target.value);
                  setSavedCard(null);
                }}
                className="w-full rounded-md border border-slate-300 py-2 pl-3 pr-12 text-right text-sm tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">
                min
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              save('reminders', {
                remindersEnabled: reminders,
                reminderMinutes: parsedReminder,
              })
            }
            disabled={!validReminder || saveMutation.isPending}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {saveMutation.isPending ? t('settings.saving') : t('settings.save')}
          </button>
          {savedCard === 'reminders' && !saveMutation.isPending && (
            <span className="text-xs text-emerald-700">{t('settings.saved')}</span>
          )}
        </div>
        {!validReminder && reminderMinutes.trim() !== '' && (
          <p className="mt-2 text-xs text-red-700">
            {t('settings.reminderRange', {
              min: REMINDER_MIN_MINUTES,
              max: REMINDER_MAX_MINUTES,
            })}
          </p>
        )}
        <p className="mt-3 text-xs text-slate-500">{t('settings.remindersPrivacy')}</p>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-base font-semibold text-slate-800">💾 {t('settings.backupTitle')}</h3>
        {/* Restoring replaces the live database, so it is only offered from
            the lock screen — there is nothing to restore *into* while open. */}
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-600">
          <li>{t('settings.backupCreate')}</li>
          <li>{t('settings.backupRestore')}</li>
          <li>{t('settings.autoBackupRestoreNote')}</li>
        </ul>
      </div>
    </section>
  );
}
