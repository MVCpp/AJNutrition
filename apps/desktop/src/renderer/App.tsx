import { useQueryClient } from '@tanstack/react-query';
import { PatientsPage } from './patients/PatientsPage';
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
 * UI copy is Spanish-first; extraction to i18next is scheduled in the backlog.
 */
export function App() {
  const queryClient = useQueryClient();
  const authStatus = useAuthStatus();

  const refreshStatus = () => queryClient.invalidateQueries({ queryKey: AUTH_STATUS_KEY });

  if (authStatus.isLoading || !authStatus.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Iniciando AJNutrition…
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
              <div>
                <h1 className="text-xl font-semibold text-slate-800">AJNutrition</h1>
                <p className="text-sm text-slate-500">Gestión de consulta nutricional</p>
              </div>
              <div className="flex items-center gap-3">
                <CreateBackupButton />
                <button
                  type="button"
                  onClick={() => void unwrap(window.ajnutrition.auth.lock()).then(refreshStatus)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                >
                  Bloquear
                </button>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-8 py-8">
            <PatientsPage />
          </main>
        </>
      )}
    </div>
  );
}
