import { useTranslation } from 'react-i18next';
import { useLicense } from './useLicense';

/**
 * The one place a lapsed subscription is announced app-wide.
 *
 * Silent during `active`, and absent entirely when licensing is not enforced.
 * The expired copy leads with what still works: her records are not the thing
 * being withheld (docs/product/subscription.md §1).
 */
export function LicenseBanner({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t } = useTranslation();
  const { data } = useLicense();

  if (!data?.enforced) return null;
  if (data.state === 'active') return null;

  const expired = data.state === 'expired';
  const tone = expired
    ? 'border-red-300 bg-red-50 text-red-900'
    : 'border-amber-300 bg-amber-50 text-amber-900';

  const message = expired
    ? t('license.bannerExpired')
    : data.state === 'grace'
      ? t('license.bannerGrace', { count: data.daysRemaining })
      : t('license.bannerTrial', { count: data.daysRemaining });

  return (
    <div
      role="status"
      className={`mx-auto mb-6 flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${tone}`}
    >
      <span>
        {expired ? '🔒' : '⏳'} {message}
      </span>
      <button
        type="button"
        onClick={onOpenSettings}
        className="rounded-md border border-current px-3 py-1.5 text-xs font-medium hover:bg-white/50"
      >
        {t('license.bannerAction')}
      </button>
    </div>
  );
}
