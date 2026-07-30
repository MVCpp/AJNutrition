import { useTranslation } from 'react-i18next';
import { useLicense } from './useLicense';

/**
 * Subscription state on the LOCK screen.
 *
 * This is the reason `license.json` lives outside the encrypted database: the
 * status is readable before unlock, so "read-only" is something she learns
 * while typing her passphrase rather than a surprise waiting on the other
 * side of it.
 *
 * Silent while active, and absent when licensing is not enforced.
 */
export function LicenseLockNotice() {
  const { t } = useTranslation();
  const { data } = useLicense();

  if (!data?.enforced) return null;
  if (data.state === 'active') return null;

  const expired = data.state === 'expired';
  const tone = expired
    ? 'border-red-200 bg-red-50 text-red-800'
    : 'border-amber-200 bg-amber-50 text-amber-800';

  const message = expired
    ? t('license.lockExpired')
    : data.state === 'grace'
      ? t('license.bannerGrace', { count: data.daysRemaining })
      : t('license.bannerTrial', { count: data.daysRemaining });

  return (
    <div role="status" className={`mb-4 rounded-md border p-3 text-sm ${tone}`}>
      {expired ? '🔒' : '⏳'} {message}
    </div>
  );
}
