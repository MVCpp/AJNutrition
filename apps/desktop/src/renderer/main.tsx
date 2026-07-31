import React from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { refreshLicenseOnRefusal } from './license/license-refresh';
import './i18n';
import './styles.css';

// A refused write must bring the licence banner with it, not leave it to the
// next slow poll. Handled here so it covers every query and mutation in the
// app — the main process gates writes at one choke point, and so do we.
// The callbacks close over `queryClient` before it is declared; that is safe
// because they only ever run after a request has failed, long after this
// module finished evaluating. The explicit annotations are load-bearing:
// without them TypeScript follows the cycle back into itself and gives up
// (TS7022), because each cache's type would depend on the client's and back.
const queryCache: QueryCache = new QueryCache({
  onError: (error, query) => refreshLicenseOnRefusal(queryClient, error, query.queryKey),
});
const mutationCache: MutationCache = new MutationCache({
  onError: (error) => refreshLicenseOnRefusal(queryClient, error),
});

const queryClient: QueryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: {
    queries: {
      // Local IPC: no flaky network, so retries only hide real bugs.
      retry: false,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('missing #root element');

createRoot(container).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);

// Hand the screen over to React's own loading state once it has painted: the
// splash fades out on top of an identical-looking view, so nothing flickers.
// requestAnimationFrame runs after that first paint.
requestAnimationFrame(() => {
  const splash = document.getElementById('boot-splash');
  if (splash === null) return;
  splash.classList.add('is-done');
  splash.addEventListener('transitionend', () => splash.remove(), { once: true });
});
