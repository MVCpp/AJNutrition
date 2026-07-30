import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach } from 'vitest';
import { cleanup, render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { AjnApi } from '@ajnutrition/shared';
import '../i18n';

/**
 * Component-test harness.
 *
 * Two deliberate choices:
 *
 * - the REAL i18n bundle is loaded, so tests query the same Spanish strings
 *   the practitioner sees. A mocked `t` returning keys would let a missing
 *   translation pass.
 * - `window.ajnutrition` is replaced with an explicit stub per test. There is
 *   no default "it works" behaviour: a component that calls an endpoint the
 *   test did not stub fails loudly instead of silently doing nothing.
 */

// Auto-cleanup is only wired up by testing-library when vitest runs with
// `globals: true`, which this workspace does not. Without it a second render
// in the same file leaves the first one mounted and every query matches twice.
afterEach(cleanup);

type DeepPartial<T> = { [K in keyof T]?: Partial<T[K]> };

export function renderWithProviders(ui: ReactElement, api: DeepPartial<AjnApi> = {}): RenderResult {
  (globalThis as { window?: unknown }).window ??= globalThis;
  (window as unknown as { ajnutrition: unknown }).ajnutrition = api;

  const queryClient = new QueryClient({
    defaultOptions: {
      // Same as production, and essential here: a retry would turn one
      // asserted failure into three and make the test time out instead.
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

/** What the preload bridge resolves to on success. */
export type OkResult<T> = Promise<{ ok: true; data: T }>;

/** `ok` envelope, matching what the preload bridge resolves to. */
export function ok<T>(data: T): OkResult<T> {
  return Promise.resolve({ ok: true as const, data });
}
