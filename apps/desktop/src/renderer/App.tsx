import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AgendaPage } from './agenda/AgendaPage';
import { HomePage } from './home/HomePage';
import { PatientsPage } from './patients/PatientsPage';
import { FoodsPage } from './foods/FoodsPage';
import { RecipesPage } from './recipes/RecipesPage';
import { ProfilePage } from './profile/ProfilePage';
import { SettingsPage } from './settings/SettingsPage';
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
  const [section, setSection] = useState<
    'home' | 'agenda' | 'patients' | 'foods' | 'recipes' | 'profile' | 'settings'
  >('home');
  const queryClient = useQueryClient();
  const authStatus = useAuthStatus();
  const state = authStatus.data?.state;

  // The one-time recovery key is shown INSIDE SetupScreen right after setup
  // succeeds — but succeeding also broadcasts "unlocked", which would unmount
  // SetupScreen before the key is ever seen. Hold the setup flow on screen
  // until the user confirms the key was saved.
  const [holdSetup, setHoldSetup] = useState(false);
  useEffect(() => {
    if (state === 'setup-required') setHoldSetup(true);
    if (state === 'locked') setHoldSetup(false);
  }, [state]);

  const refreshStatus = () => queryClient.invalidateQueries({ queryKey: AUTH_STATUS_KEY });

  if (authStatus.isLoading || !authStatus.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        {t('app.loading')}
      </div>
    );
  }

  const showSetup = state === 'setup-required' || (holdSetup && state === 'unlocked');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {showSetup && (
        <SetupScreen
          onFinished={() => {
            setHoldSetup(false);
            void refreshStatus();
          }}
        />
      )}
      {state === 'locked' && <LockScreen status={authStatus.data} />}
      {state === 'unlocked' && !holdSetup && (
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
                      ['home', 'app.navHome', '🏠'],
                      ['agenda', 'app.navAgenda', '📅'],
                      ['patients', 'app.navPatients', '👥'],
                      ['foods', 'app.navFoods', '🥑'],
                      ['recipes', 'app.navRecipes', '🍲'],
                      ['profile', 'app.navProfile', '👤'],
                      ['settings', 'app.navSettings', '⚙️'],
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
            {/* Every section stays mounted and is only hidden, so half-typed
                forms and open detail views survive switching tabs. */}
            <div className={section === 'home' ? '' : 'hidden'}>
              <HomePage onNavigate={setSection} />
            </div>
            <div className={section === 'agenda' ? '' : 'hidden'}>
              <AgendaPage />
            </div>
            <div className={section === 'patients' ? '' : 'hidden'}>
              <PatientsPage />
            </div>
            <div className={section === 'foods' ? '' : 'hidden'}>
              <FoodsPage />
            </div>
            <div className={section === 'recipes' ? '' : 'hidden'}>
              <RecipesPage />
            </div>
            <div className={section === 'profile' ? '' : 'hidden'}>
              <ProfilePage />
            </div>
            <div className={section === 'settings' ? '' : 'hidden'}>
              <SettingsPage />
            </div>
          </main>
        </>
      )}
    </div>
  );
}
