import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PhotoDto, PhotoKind, PatientDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';

const KINDS: PhotoKind[] = ['front', 'side_left', 'side_right', 'back'];

export function PhotosPanel({ patient }: { patient: PatientDto }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [capturedAt, setCapturedAt] = useState(today);

  const photosQuery = useQuery({
    queryKey: ['photos', patient.id],
    queryFn: () => unwrap(window.ajnutrition.photo.list({ patientId: patient.id })),
  });

  const consentsQuery = useQuery({
    queryKey: ['consents', patient.id],
    queryFn: () => unwrap(window.ajnutrition.consent.list({ patientId: patient.id })),
  });

  const photoConsentActive = (() => {
    let latest: { decidedAt: string; status: string } | null = null;
    for (const record of consentsQuery.data ?? []) {
      if (record.consentType !== 'photo') continue;
      if (!latest || record.decidedAt > latest.decidedAt) latest = record;
    }
    return latest?.status === 'accepted';
  })();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['photos', patient.id] });

  const addMutation = useMutation({
    mutationFn: (kind: PhotoKind) =>
      unwrap(window.ajnutrition.photo.add({ patientId: patient.id, kind, capturedAt })),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (photoId: string) => unwrap(window.ajnutrition.photo.delete({ photoId })),
    onSuccess: invalidate,
  });

  const errorMessage =
    addMutation.error instanceof ApiError
      ? `${addMutation.error.message} (${addMutation.error.detail.supportCode})`
      : deleteMutation.error instanceof ApiError
        ? `${deleteMutation.error.message} (${deleteMutation.error.detail.supportCode})`
        : null;

  const byKind = new Map<PhotoKind, PhotoDto[]>();
  for (const photo of photosQuery.data ?? []) {
    const list = byKind.get(photo.kind) ?? [];
    list.push(photo);
    byKind.set(photo.kind, list);
  }

  return (
    <div>
      <p className="mb-4 text-xs text-slate-500">{t('photos.encryptedNote')}</p>

      {!photoConsentActive && consentsQuery.isSuccess && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        >
          {t('photos.consentMissing')}
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {errorMessage}
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="photo-date" className="mb-1 block text-sm font-medium">
            {t('photos.date')}
          </label>
          <input
            id="photo-date"
            type="date"
            value={capturedAt}
            max={today}
            onChange={(e) => setCapturedAt(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={!photoConsentActive || addMutation.isPending}
            onClick={() => addMutation.mutate(kind)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {addMutation.isPending
              ? t('photos.adding')
              : t('photos.add', { kind: t(`photos.kinds.${kind}`) })}
          </button>
        ))}
      </div>

      {photosQuery.isLoading && <p className="text-sm text-slate-500">{t('photos.loading')}</p>}
      {photosQuery.isError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {t('photos.loadError', { message: (photosQuery.error as Error).message })}
        </div>
      )}
      {photosQuery.data && photosQuery.data.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {t('photos.empty')}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {KINDS.filter((kind) => byKind.has(kind)).map((kind) => (
          <section key={kind} aria-label={t(`photos.kinds.${kind}`)}>
            <h3 className="mb-2 text-xs font-medium uppercase text-slate-500">
              {t(`photos.kinds.${kind}`)}
            </h3>
            <ul className="space-y-3">
              {byKind.get(kind)?.map((photo) => (
                <li key={photo.id} className="rounded-md border border-slate-200 bg-white p-2">
                  <PhotoImage photoId={photo.id} alt={t(`photos.kinds.${kind}`)} />
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs text-slate-500">{photo.capturedAt}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(t('photos.deleteConfirm'))) {
                          deleteMutation.mutate(photo.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="text-xs text-red-700 underline-offset-2 hover:underline disabled:opacity-50"
                    >
                      {t('photos.delete')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function PhotoImage({ photoId, alt }: { photoId: string; alt: string }) {
  const dataQuery = useQuery({
    queryKey: ['photo-data', photoId],
    queryFn: () => unwrap(window.ajnutrition.photo.get({ photoId })),
    staleTime: Infinity,
  });

  if (!dataQuery.data) {
    return <div className="h-40 w-full animate-pulse rounded bg-slate-100" aria-hidden="true" />;
  }
  return (
    <img src={dataQuery.data.dataUrl} alt={alt} className="max-h-64 w-full rounded object-cover" />
  );
}
