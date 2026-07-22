import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiError, unwrap } from '../api';

/** Header action: create an encrypted backup at a user-chosen location. */
export function CreateBackupButton() {
  const [message, setMessage] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => unwrap(window.ajnutrition.backup.create({})),
    onSuccess: (result) => {
      setMessage(
        result.canceled
          ? null
          : `Respaldo creado: ${result.fileName} (${formatSize(result.sizeBytes ?? 0)})`,
      );
    },
    onError: (err) =>
      setMessage(err instanceof ApiError ? err.message : 'No fue posible crear el respaldo.'),
  });

  return (
    <div className="flex items-center gap-3">
      {message && (
        <p role="status" className="max-w-md truncate text-xs text-slate-500" title={message}>
          {message}
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          setMessage(null);
          createMutation.mutate();
        }}
        disabled={createMutation.isPending}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
      >
        {createMutation.isPending ? 'Creando respaldo…' : 'Crear respaldo'}
      </button>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
