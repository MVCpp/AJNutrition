import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

/**
 * One-time recovery key display. The key exists only in this component's
 * memory; the app never stores it. The user must actively confirm they
 * saved it before continuing.
 */
export function RecoveryKeyPanel({
  recoveryKey,
  onConfirmed,
}: {
  recoveryKey: string;
  onConfirmed: () => void;
}) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-6">
      <h3 className="mb-2 text-base font-semibold text-amber-900">{t('recoveryKey.heading')}</h3>
      <p className="mb-4 text-sm text-amber-800">
        <Trans i18nKey="recoveryKey.intro" components={{ strong: <strong /> }} />
      </p>
      <p className="mb-4 select-all break-all rounded-md border border-amber-200 bg-white p-4 text-center font-mono text-sm tracking-wide">
        {recoveryKey}
      </p>
      <p className="mb-4 text-sm font-medium text-red-800">{t('recoveryKey.warning')}</p>
      <label className="mb-4 flex items-start gap-2 text-sm text-amber-900">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-0.5"
        />
        {t('recoveryKey.savedCheckbox')}
      </label>
      <button
        type="button"
        disabled={!saved}
        onClick={onConfirmed}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {t('recoveryKey.continue')}
      </button>
    </div>
  );
}
