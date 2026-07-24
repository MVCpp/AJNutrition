import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PatientsPage } from './patients/PatientsPage';
import { FoodsPage } from './foods/FoodsPage';
import { RecipesPage } from './recipes/RecipesPage';
import { ProfilePage } from './profile/ProfilePage';
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
  const [section, setSection] = useState<'patients' | 'foods' | 'recipes' | 'profile'>('patients');
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
          <header className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-emerald-700 px-8 py-4 text-white shadow-md">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-xl ring-1 ring-white/20"
                  >
                    🥗
                  </span>
                  <div>
                    <h1 className="text-lg font-semibold leading-tight">{t('app.title')}</h1>
                    <p className="text-xs text-emerald-100/90">{t('app.subtitle')}</p>
                  </div>
                </div>
                <nav className="flex gap-1" aria-label={t('app.title')}>
                  {(
                    [
                      ['patients', 'app.navPatients', '👥'],
                      ['foods', 'app.navFoods', '🥑'],
                      ['recipes', 'app.navRecipes', '🍲'],
                      ['profile', 'app.navProfile', '👤'],
                    ] as const
                  ).map(([id, labelKey, icon]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSection(id)}
                      aria-current={section === id ? 'page' : undefined}
                      className={
                        section === id
                          ? 'flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 shadow-sm'
                          : 'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-emerald-50/90 transition-colors hover:bg-white/10 hover:text-white'
                      }
                    >
                      <span aria-hidden="true">{icon}</span>
                      {t(labelKey)}
                    </button>
                  ))}
                </nav>
              </div>
              <div className="flex items-center gap-2">
                <CreateBackupButton />
                <button
                  type="button"
                  onClick={() => void unwrap(window.ajnutrition.auth.lock()).then(refreshStatus)}
                  className="rounded-lg border border-white/25 px-3 py-2 text-sm text-emerald-50 transition-colors hover:bg-white/10"
                >
                  🔒 {t('app.lock')}
                </button>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-8 py-8">
            {section === 'patients' && <PatientsPage />}
            {section === 'foods' && <FoodsPage />}
            {section === 'recipes' && <RecipesPage />}
            {section === 'profile' && <ProfilePage />}
          </main>
        </>
      )}
    </div>
  );
}
