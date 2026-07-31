import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { SerializedAppError } from '@ajnutrition/shared';
import { ApiError } from '../api';
import { isLicenseRefusal, refreshLicenseOnRefusal } from './license-refresh';
import { LICENSE_KEY } from './useLicense';

const error = (code: SerializedAppError['code']) =>
  new ApiError({ code, message: 'no', supportCode: 'AJN-TEST' });

function spyClient() {
  const client = new QueryClient();
  return { client, invalidate: vi.spyOn(client, 'invalidateQueries') };
}

describe('isLicenseRefusal', () => {
  it('recognises the write-gate refusal', () => {
    expect(isLicenseRefusal(error('LICENSE'))).toBe(true);
  });

  it.each(['VALIDATION', 'AUTHORIZATION', 'NOT_FOUND', 'DATABASE'] as const)(
    'ignores a %s failure',
    (code) => {
      expect(isLicenseRefusal(error(code))).toBe(false);
    },
  );

  it('ignores anything that is not an ApiError', () => {
    expect(isLicenseRefusal(new Error('boom'))).toBe(false);
    expect(isLicenseRefusal(undefined)).toBe(false);
    expect(isLicenseRefusal({ detail: { code: 'LICENSE' } })).toBe(false);
  });
});

describe('refreshLicenseOnRefusal', () => {
  it('refreshes the licence the moment a write is refused', () => {
    // Without this the practitioner sees the refusal while the banner stays
    // hidden and Ajustes still claims the subscription is fine.
    const { client, invalidate } = spyClient();

    refreshLicenseOnRefusal(client, error('LICENSE'), ['patients']);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: LICENSE_KEY });
  });

  it('refreshes for a mutation, where there is no query key at all', () => {
    const { client, invalidate } = spyClient();

    refreshLicenseOnRefusal(client, error('LICENSE'));

    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('leaves every other failure alone', () => {
    const { client, invalidate } = spyClient();

    refreshLicenseOnRefusal(client, error('VALIDATION'), ['patients']);
    refreshLicenseOnRefusal(client, new Error('boom'), ['patients']);

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('does not invalidate the licence query on its own failure', () => {
    // The status channel is classified `always` and cannot be gated, so this
    // is unreachable today — the guard exists so that a future
    // misclassification degrades to a stale banner instead of a refetch loop.
    const { client, invalidate } = spyClient();

    refreshLicenseOnRefusal(client, error('LICENSE'), LICENSE_KEY);

    expect(invalidate).not.toHaveBeenCalled();
  });
});
