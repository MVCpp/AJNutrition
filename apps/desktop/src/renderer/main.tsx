import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import './i18n';
import './styles.css';

const queryClient = new QueryClient({
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
