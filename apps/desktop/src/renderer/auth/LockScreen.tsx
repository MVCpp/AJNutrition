import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AuthStatusDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';
import { AUTH_STATUS_KEY } from './useAuthStatus';
import { RecoveryKeyPanel } from './RecoveryKeyPanel';
import { RestoreBackupPanel } from '../backup/RestoreBackupPanel';

export function LockScreen({ status }: { status: AuthStatusDto }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'passphrase' | 'recovery'>('passphrase');
  const [passphrase, setPassphrase] = useState('');
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [newConfirmation, setNewConfirmation] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null);

  const waiting = status.retryDelaySeconds > 0;

  const refreshStatus = () =>
    queryClient.invalidateQueries({ queryKey: AUTH_STATUS_KEY });

  const unlockMutation = useMutation({
    mutationFn: () => unwrap(window.ajnutrition.auth.unlock({ passphrase })),
    onSuccess: () => setPassphrase(''),
    onSettled: refreshStatus,
  });

  const recoveryMutation = useMutation({
    mutationFn: () =>
      unwrap(
        window.ajnutrition.auth.unlockWithRecovery({
          recoveryKey: recoveryKeyInput,
          newPassphrase,
        }),
      ),
    onSuccess: (result) => setNewRecoveryKey(result.recoveryKey),
    onSettled: refreshStatus,
  });

  if (newRecoveryKey !== null) {
    return (
      <div className="mx-auto max-w-xl px-8 py-16">
        <RecoveryKeyPanel
          recoveryKey={newRecoveryKey}
          onConfirmed={() => {
            setNewRecoveryKey(null);
            void refreshStatus();
          }}
        />
      </div>
    );
  }

  const activeError =
    localError ??
    (unlockMutation.error instanceof ApiError ? unlockMutation.error.message : null) ??
    (recoveryMutation.error instanceof ApiError ? recoveryMutation.error.message : null);

  const submitRecovery = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (newPassphrase.length < 12) {
      setLocalError('La nueva frase de acceso debe tener al menos 12 caracteres.');
      return;
    }
    if (newPassphrase !== newConfirmation) {
      setLocalError('Las frases de acceso no coinciden.');
      return;
    }
    recoveryMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-md px-8 py-16">
      <h2 className="mb-2 text-xl font-semibold">AJNutrition está bloqueado</h2>
      <p className="mb-6 text-sm text-slate-600">
        La información clínica está cifrada. Introduzca su frase de acceso para continuar.
      </p>

      {activeError && (
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {activeError}
        </div>
      )}
      {waiting && (
        <div role="status" className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Demasiados intentos fallidos. Espere {status.retryDelaySeconds} s antes de reintentar.
        </div>
      )}

      {mode === 'passphrase' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setLocalError(null);
            unlockMutation.mutate();
          }}
          noValidate
          className="rounded-lg border border-slate-200 bg-white p-6"
        >
          <label htmlFor="unlock-passphrase" className="mb-1 block text-sm font-medium">
            Frase de acceso
          </label>
          <input
            id="unlock-passphrase"
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoFocus
            className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={unlockMutation.isPending || waiting || passphrase.length === 0}
            className="w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {unlockMutation.isPending ? 'Desbloqueando…' : 'Desbloquear'}
          </button>
          <button
            type="button"
            onClick={() => {
              setLocalError(null);
              setMode('recovery');
            }}
            className="mt-3 w-full text-center text-xs text-slate-500 underline hover:text-slate-700"
          >
            Olvidé mi frase de acceso — usar clave de recuperación
          </button>
        </form>
      ) : (
        <form onSubmit={submitRecovery} noValidate className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="mb-4">
            <label htmlFor="recovery-key" className="mb-1 block text-sm font-medium">
              Clave de recuperación
            </label>
            <input
              id="recovery-key"
              value={recoveryKeyInput}
              onChange={(e) => setRecoveryKeyInput(e.target.value)}
              autoFocus
              placeholder="XXXXXXXX-XXXXXXXX-…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="new-passphrase" className="mb-1 block text-sm font-medium">
              Nueva frase de acceso (mínimo 12 caracteres)
            </label>
            <input
              id="new-passphrase"
              type="password"
              value={newPassphrase}
              onChange={(e) => setNewPassphrase(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="new-confirmation" className="mb-1 block text-sm font-medium">
              Confirme la nueva frase de acceso
            </label>
            <input
              id="new-confirmation"
              type="password"
              value={newConfirmation}
              onChange={(e) => setNewConfirmation(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={recoveryMutation.isPending || waiting}
            className="w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {recoveryMutation.isPending ? 'Recuperando…' : 'Recuperar acceso'}
          </button>
          <button
            type="button"
            onClick={() => {
              setLocalError(null);
              setMode('passphrase');
            }}
            className="mt-3 w-full text-center text-xs text-slate-500 underline hover:text-slate-700"
          >
            Volver al desbloqueo con frase de acceso
          </button>
        </form>
      )}

      <RestoreBackupPanel />
    </div>
  );
}
