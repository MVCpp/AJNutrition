import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PatientsPage } from './patients/PatientsPage';
import { FoodsPage } from './foods/FoodsPage';
import { LockScreen } from './auth/LockScreen';
import { SetupScreen } from './auth/SetupScreen';
import { AUTH_STATUS_KEY, useAuthStatus } from './auth/useAuthStatus';
import { CreateBackupButton } from './backup/CreateBackupButton';
import { unwrap } from './api';

/**
 * Application shell, gated by the auth state machine:
 * setup-required → SetupScreen · locked → LockScreen · unlocked → app.
 *
 * Routing (TanStack Router) arrives with the second authenticated screen.
 */
export function App() {
  const { t } = useTranslation();
  const [section, setSection] = useState<'patients' | 'foods'>('patients');
  const queryClient = useQueryClient();
  const authStatus = useAuthStatus();

  const refreshStatus = () => queryClient.invalidateQueries({ queryKey: AUTH_STATUS_KEY });

  if (authStatus.isLoading || !authStatus.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        {t('app.loading')}
      </div>
    );
  }

  const { state } = authStatus.data;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {state === 'setup-required' && <SetupScreen onFinished={() => void refreshStatus()} />}
      {state === 'locked' && <LockScreen status={authStatus.data} />}
      {state === 'unlocked' && (
        <>
          <header className="border-b border-slate-200 bg-white px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div>
                  <h1 className="text-xl font-semibold text-slate-800">{t('app.title')}</h1>
                  <p className="text-sm text-slate-500">{t('app.subtitle')}</p>
                </div>
                <nav className="flex gap-1" aria-label={t('app.title')}>
                  {(['patients', 'foods'] as const).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSection(id)}
                      aria-current={section === id ? 'page' : undefined}
                      className={
                        section === id
                          ? 'rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800'
                          : 'rounded-md px-3 py-1.5 text-sm text-slate-500 hover:text-slate-800'
                      }
                    >
                      {t(id === 'patients' ? 'app.navPatients' : 'app.navFoods')}
                    </button>
                  ))}
                </nav>
              </div>
              <div className="flex items-center gap-3">
                <CreateBackupButton />
                <button
                  type="button"
                  onClick={() => void unwrap(window.ajnutrition.auth.lock()).then(refreshStatus)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                >
                  {t('app.lock')}
                </button>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-8 py-8">
            {section === 'patients' ? <PatientsPage /> : <FoodsPage />}
          </main>
        </>
      )}
    </div>
  );
}
