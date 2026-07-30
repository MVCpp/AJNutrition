import { useQuery } from '@tanstack/react-query';
import type { LicenseStatusDto } from '@ajnutrition/shared';
import { unwrap } from '../api';

export const LICENSE_KEY = ['license'] as const;

/**
 * Subscription status, shared by the banner and the Ajustes panel.
 *
 * Refetched on an interval so a trial that runs out mid-session, or a licence
 * activated in another window, is reflected without a restart. The interval is
 * long: this reads a small local file, but the state it reports changes at the
 * speed of days.
 */
export function useLicense() {
  return useQuery<LicenseStatusDto>({
    queryKey: LICENSE_KEY,
    queryFn: () => unwrap(window.ajnutrition.license.getStatus()),
    refetchInterval: 10 * 60 * 1000,
  });
}
