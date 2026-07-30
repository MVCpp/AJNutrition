import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, unwrap } from '../api';
import { LICENSE_KEY, useLicense } from './useLicense';

const STATE_TONE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  trial: 'bg-sky-100 text-sky-800',
  grace: 'bg-amber-100 text-amber-800',
  expired: 'bg-red-100 text-red-800',
};

/** Ajustes → Suscripción. Hidden entirely while licensing is not enforced. */
export function LicensePanel() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useLicense();
  const [token, setToken] = useState('');
  const [activated, setActivated] = useState(false);

  const refresh = async () => {
    setActivated(true);
    setToken('');
    await queryClient.invalidateQueries({ queryKey: LICENSE_KEY });
  };

  const pasteMutation = useMutation({
    mutationFn: (value: string) => unwrap(window.ajnutrition.license.activate({ token: value })),
    onSuccess: refresh,
  });

  const fileMutation = useMutation({
    mutationFn: () => unwrap(window.ajnutrition.license.loadFromFile()),
    onSuccess: async (result) => {
      if (!result.canceled) await refresh();
    },
  });

  if (!data?.enforced) return null;

  const error =
    pasteMutation.error instanceof ApiError
      ? pasteMutation.error.message
      : fileMutation.error instanceof ApiError
        ? fileMutation.error.message
        : null;
  const busy = pasteMutation.isPending || fileMutation.isPending;

  const endsAt = data.endsAt
    ? new Date(data.endsAt).toLocaleDateString(i18n.language, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-base font-semibold text-slate-800">🎟️ {t('license.sectionTitle')}</h3>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${STATE_TONE[data.state] ?? ''}`}
        >
          {t(`license.state.${data.state}`)}
        </span>
      </div>

      <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        {data.holder && (
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-slate-500">{t('license.holder')}</dt>
            <dd className="font-medium text-slate-800">{data.holder}</dd>
          </div>
        )}
        {data.plan && (
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-slate-500">{t('license.plan')}</dt>
            <dd className="font-medium text-slate-800">{t(`license.plans.${data.plan}`)}</dd>
          </div>
        )}
        {endsAt && (
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-slate-500">
              {data.state === 'expired' ? t('license.endedOn') : t('license.endsOn')}
            </dt>
            <dd className="font-medium text-slate-800">
              {endsAt}
              {data.state !== 'expired' && (
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {t('license.daysRemaining', { count: data.daysRemaining })}
                </span>
              )}
            </dd>
          </div>
        )}
        {data.licenseId && (
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-slate-500">{t('license.id')}</dt>
            <dd className="font-mono text-xs text-slate-600">{data.licenseId}</dd>
          </div>
        )}
      </dl>

      {/* What "read-only" actually means, spelled out where she will look for
          it. Vagueness here reads as "my records are locked", which is exactly
          the thing that is NOT happening. */}
      {data.state === 'expired' && (
        <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-900">
          {t('license.expiredExplanation')}
        </p>
      )}
      {data.invalidToken && (
        <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          {t('license.invalidToken')}
        </p>
      )}
      {data.clockTampered && (
        <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          {t('license.clockWarning')}
        </p>
      )}

      <div className="mt-5 border-t border-slate-100 pt-5">
        <label htmlFor="license-token" className="mb-1 block text-sm font-medium">
          {t('license.activateLabel')}
        </label>
        <textarea
          id="license-token"
          rows={3}
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setActivated(false);
          }}
          placeholder="NPL1..."
          className="w-full rounded-md border border-slate-300 p-2 font-mono text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => pasteMutation.mutate(token)}
            disabled={token.trim().length === 0 || busy}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {t('license.activate')}
          </button>
          <button
            type="button"
            onClick={() => fileMutation.mutate()}
            disabled={busy}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {t('license.loadFromFile')}
          </button>
          {activated && !busy && (
            <span className="text-xs text-emerald-700">{t('license.activated')}</span>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
