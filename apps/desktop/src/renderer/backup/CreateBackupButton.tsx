import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, unwrap } from '../api';

/** Header action: create an encrypted backup at a user-chosen location. */
export function CreateBackupButton() {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => unwrap(window.ajnutrition.backup.create({})),
    onSuccess: (result) => {
      setMessage(
        result.canceled
          ? null
          : t('backup.created', {
              fileName: result.fileName,
              size: formatSize(result.sizeBytes ?? 0),
            }),
      );
    },
    onError: (err) => setMessage(err instanceof ApiError ? err.message : t('backup.createFailed')),
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
        className="rounded-lg border border-white/25 px-3 py-2 text-sm text-emerald-50 transition-colors hover:bg-white/10 disabled:opacity-50"
      >
        {createMutation.isPending ? t('backup.creating') : t('backup.create')}
      </button>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
