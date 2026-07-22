import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, unwrap } from '../api';
import { RecoveryKeyPanel } from './RecoveryKeyPanel';
import { RestoreBackupPanel } from '../backup/RestoreBackupPanel';

const MIN_LENGTH = 12;

export function SetupScreen({ onFinished }: { onFinished: () => void }) {
  const { t } = useTranslation();
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);

  const setupMutation = useMutation({
    mutationFn: () => unwrap(window.ajnutrition.auth.setup({ passphrase })),
    onSuccess: (result) => setRecoveryKey(result.recoveryKey),
  });

  if (recoveryKey !== null) {
    return (
      <div className="mx-auto max-w-xl px-8 py-16">
        <RecoveryKeyPanel recoveryKey={recoveryKey} onConfirmed={onFinished} />
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (passphrase.length < MIN_LENGTH) {
      setLocalError(t('setup.tooShort', { min: MIN_LENGTH }));
      return;
    }
    if (passphrase !== confirmation) {
      setLocalError(t('setup.mismatch'));
      return;
    }
    setupMutation.mutate();
  };

  const serverError = setupMutation.error instanceof ApiError ? setupMutation.error : null;

  return (
    <div className="mx-auto max-w-xl px-8 py-16">
      <h2 className="mb-2 text-xl font-semibold">{t('setup.heading')}</h2>
      <p className="mb-6 text-sm text-slate-600">{t('setup.intro')}</p>

      <form
        onSubmit={submit}
        noValidate
        className="rounded-lg border border-slate-200 bg-white p-6"
      >
        {(localError || serverError) && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {localError ?? serverError?.message}
            {serverError && (
              <span className="ml-1 text-xs text-red-600">({serverError.detail.supportCode})</span>
            )}
          </div>
        )}

        <div className="mb-4">
          <label htmlFor="setup-passphrase" className="mb-1 block text-sm font-medium">
            {t('setup.passphraseLabel', { min: MIN_LENGTH })}
          </label>
          <input
            id="setup-passphrase"
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoFocus
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">{t('setup.passphraseHint')}</p>
        </div>

        <div className="mb-6">
          <label htmlFor="setup-confirmation" className="mb-1 block text-sm font-medium">
            {t('setup.confirmLabel')}
          </label>
          <input
            id="setup-confirmation"
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={setupMutation.isPending}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {setupMutation.isPending ? t('setup.submitting') : t('setup.submit')}
        </button>
      </form>

      <RestoreBackupPanel />
    </div>
  );
}
