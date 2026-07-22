import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PreviewBackupResultDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';

/**
 * Restore flow (lock/setup screens): choose file → review metadata →
 * confirm with passphrase. The passphrase is the one that protected the
 * backup — this works on a brand-new machine.
 */
export function RestoreBackupPanel() {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<PreviewBackupResultDto | null>(null);
  const [passphrase, setPassphrase] = useState('');

  const previewMutation = useMutation({
    mutationFn: () => unwrap(window.ajnutrition.backup.preview()),
    onSuccess: (result) => {
      if (!result.canceled) setPreview(result);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: () => {
      if (!preview?.token) throw new Error('sin vista previa');
      return unwrap(
        window.ajnutrition.backup.restore({ token: preview.token, passphrase }),
      );
    },
    onSuccess: async () => {
      setPassphrase('');
      setPreview(null);
      // The restore unlocks the app; refresh everything.
      await queryClient.invalidateQueries();
    },
  });

  const error =
    (previewMutation.error instanceof ApiError ? previewMutation.error : null) ??
    (restoreMutation.error instanceof ApiError ? restoreMutation.error : null);

  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
      <h3 className="mb-2 text-sm font-semibold text-slate-800">Restaurar desde un respaldo</h3>
      <p className="mb-4 text-xs text-slate-500">
        Recupere sus datos desde un archivo <span className="font-mono">.ajnbackup</span> usando la
        frase de acceso con la que fue creado.
      </p>

      {error && (
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error.message}{' '}
          <span className="text-xs text-red-600">({error.detail.supportCode})</span>
        </div>
      )}

      {preview === null ? (
        <button
          type="button"
          onClick={() => previewMutation.mutate()}
          disabled={previewMutation.isPending}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {previewMutation.isPending ? 'Abriendo…' : 'Seleccionar archivo de respaldo'}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            restoreMutation.mutate();
          }}
          noValidate
        >
          <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
            <dt className="font-medium">Archivo</dt>
            <dd className="truncate" title={preview.fileName ?? ''}>{preview.fileName}</dd>
            <dt className="font-medium">Creado</dt>
            <dd>{preview.createdAt ? new Date(preview.createdAt).toLocaleString() : '—'}</dd>
            <dt className="font-medium">Versión de la aplicación</dt>
            <dd>{preview.appVersion}</dd>
            {preview.description && (
              <>
                <dt className="font-medium">Descripción</dt>
                <dd>{preview.description}</dd>
              </>
            )}
          </dl>

          <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            La restauración reemplazará los datos actuales de esta computadora. Se conservará una
            copia de seguridad local de los datos reemplazados.
          </p>

          <label htmlFor="restore-passphrase" className="mb-1 block text-sm font-medium">
            Frase de acceso del respaldo
          </label>
          <input
            id="restore-passphrase"
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoFocus
            className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={restoreMutation.isPending || passphrase.length === 0}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {restoreMutation.isPending ? 'Restaurando…' : 'Restaurar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setPassphrase('');
              }}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
