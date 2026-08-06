import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { CoachDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';
import { Modal } from '../components/Modal';
import { CoachForm } from './CoachForm';

/**
 * Personal trainers who refer trainees (docs/product/coach-sharing.md, C-1).
 *
 * The list itself shows who trains with whom and nothing else — it never
 * displays a measurement, a plan or a note.
 *
 * The pack button on a coach's page (C-3) generates one report per trainee who
 * has an EFFECTIVE authorisation, and lists everyone it skipped with the
 * reason. The skip list is not a nicety: a batch that silently left someone out
 * reads as "everyone was included", and she would either send the trainer less
 * than she believes, or believe a patient consented when they did not.
 */
export function CoachesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  // undefined = closed · null = creating · CoachDto = editing
  const [editor, setEditor] = useState<CoachDto | null | undefined>(undefined);
  const [selected, setSelected] = useState<CoachDto | null>(null);

  const coachesQuery = useQuery({
    queryKey: ['coaches', search, includeArchived],
    queryFn: () =>
      unwrap(
        window.ajnutrition.coach.list({
          ...(search ? { search } : {}),
          ...(includeArchived ? { includeArchived: true } : {}),
        }),
      ),
    enabled: selected === null,
  });

  const statusMutation = useMutation({
    mutationFn: (variables: { coachId: string; status: 'active' | 'archived' }) =>
      unwrap(window.ajnutrition.coach.setStatus(variables)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coaches'] }),
  });

  if (selected !== null) {
    return <CoachDetail coach={selected} onBack={() => setSelected(null)} />;
  }

  const coaches = coachesQuery.data ?? [];
  const statusError = statusMutation.error instanceof ApiError ? statusMutation.error : null;

  return (
    <section aria-labelledby="coaches-heading">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 id="coaches-heading" className="text-lg font-semibold">
          {t('coaches.heading')}
        </h2>
        <button
          type="button"
          onClick={() => setEditor(null)}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus:outline-2 focus:outline-offset-2 focus:outline-emerald-700"
        >
          {t('coaches.newCoach')}
        </button>
      </div>

      <p className="mb-6 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        {t('coaches.intro')}
      </p>

      {editor !== undefined && (
        <Modal
          icon="🏋️"
          title={editor === null ? t('coaches.newCoach') : t('coaches.editCoach')}
          onClose={() => setEditor(undefined)}
        >
          <CoachForm
            coach={editor ?? undefined}
            onSaved={() => setEditor(undefined)}
            key={editor?.id ?? 'new'}
          />
        </Modal>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="coach-search" className="mb-1 block text-sm font-medium text-slate-700">
            {t('coaches.searchLabel')}
          </label>
          <input
            id="coach-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('coaches.searchPlaceholder')}
            className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-2 focus:outline-emerald-700"
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500"
          />
          {t('coaches.includeArchived')}
        </label>
      </div>

      {statusError && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {statusError.message}
        </p>
      )}

      {coachesQuery.isLoading && <p className="text-sm text-slate-500">{t('coaches.loading')}</p>}
      {coaches.length === 0 && !coachesQuery.isLoading && (
        <p className="text-sm text-slate-500">{t('coaches.empty')}</p>
      )}

      {coaches.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">{t('coaches.name')}</th>
              <th className="py-2">{t('coaches.organization')}</th>
              <th className="py-2">{t('coaches.traineeCount')}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {coaches.map((coach) => (
              <tr key={coach.id} className="border-b border-slate-100">
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() => setSelected(coach)}
                    className="font-medium text-emerald-800 underline hover:text-emerald-900"
                  >
                    {coach.displayName}
                  </button>
                  {coach.status === 'archived' && (
                    <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                      {t('coaches.archived')}
                    </span>
                  )}
                </td>
                <td className="py-2 text-slate-600">{coach.organization ?? '—'}</td>
                <td className="py-2 text-slate-600">{coach.activeTraineeCount}</td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setEditor(coach)}
                    className="mr-2 rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    {t('coaches.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      statusMutation.mutate({
                        coachId: coach.id,
                        status: coach.status === 'archived' ? 'active' : 'archived',
                      })
                    }
                    className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    {coach.status === 'archived' ? t('coaches.restore') : t('coaches.archive')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** A coach and their current trainees — names and file numbers only. */
function CoachDetail({ coach, onBack }: { coach: CoachDto; onBack: () => void }) {
  const { t } = useTranslation();
  const packMutation = useMutation({
    mutationFn: () => unwrap(window.ajnutrition.coach.exportPack({ coachId: coach.id })),
  });
  const packError = packMutation.error instanceof ApiError ? packMutation.error : null;
  const pack = packMutation.data ?? null;
  const detailQuery = useQuery({
    queryKey: ['coach', coach.id],
    queryFn: () => unwrap(window.ajnutrition.coach.get({ coachId: coach.id })),
  });

  const trainees = detailQuery.data?.trainees ?? [];

  return (
    <section aria-label={coach.displayName}>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm text-slate-500 underline hover:text-slate-700"
      >
        {t('coaches.back')}
      </button>

      <div className="mb-4 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-white p-4">
        <h2 className="text-lg font-semibold text-slate-800">{coach.displayName}</h2>
        <p className="text-sm text-slate-500">
          {coach.organization ?? t('coaches.noOrganization')}
          {coach.email && <span className="ml-2 text-slate-400">· {coach.email}</span>}
        </p>
      </div>

      <div className="mb-4">
        <button
          type="button"
          disabled={packMutation.isPending}
          onClick={() => packMutation.mutate()}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {t('coaches.exportPack')}
        </button>
        <p className="mt-1 text-xs text-slate-500">{t('coaches.exportPackNote')}</p>
      </div>

      {packError && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {packError.message}
        </p>
      )}

      {pack && !pack.canceled && (
        <div role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm text-emerald-900">
            {t('coaches.packWritten', { count: pack.written.length, folder: pack.folderName })}
          </p>
          {/* Never silent. A batch that quietly left someone out reads as
              "everyone was included", and she would send the trainer less
              than she believes she did — or believe a patient consented. */}
          {pack.skipped.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-amber-900">
              {pack.skipped.map((skip) => (
                <li key={skip.patientName}>
                  {skip.patientName} —{' '}
                  {skip.reason === 'no_authorisation'
                    ? t('coaches.packNoAuthorisation')
                    : t(`sharing.reason.${skip.reason}`)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <h3 className="mb-2 text-sm font-semibold text-slate-700">
        {t('coaches.traineesHeading', { count: trainees.length })}
      </h3>
      {/* Deliberately identity only. Progress belongs to the patient, and
          showing it here would blur the line the consent in C-2 draws. */}
      <p className="mb-3 text-xs text-slate-500">{t('coaches.traineesNote')}</p>

      {detailQuery.isLoading && <p className="text-sm text-slate-500">{t('coaches.loading')}</p>}
      {!detailQuery.isLoading && trainees.length === 0 && (
        <p className="text-sm text-slate-500">{t('coaches.noTrainees')}</p>
      )}
      {trainees.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {trainees.map((trainee) => (
            <li key={trainee.linkId} className="flex justify-between px-3 py-2 text-sm">
              <span>
                {trainee.patient.firstName} {trainee.patient.lastName}
              </span>
              <span className="font-mono text-xs text-slate-400">
                {t('coaches.fileBadge', { n: trainee.patient.fileNumber })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
