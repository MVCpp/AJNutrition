import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PatientDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';
import { Modal } from '../components/Modal';
import { paginate } from '../ui/paginate';
import { PatientForm } from './PatientForm';
import { PatientTable } from './PatientTable';
import { PatientWorkspace } from './PatientWorkspace';

const PAGE_SIZE = 25;

export function PatientsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  /** '' = every patient · a coach id = only that trainer's current trainees. */
  const [coachId, setCoachId] = useState('');
  const [page, setPage] = useState(0);
  // undefined = closed · null = creating · PatientDto = editing
  const [editor, setEditor] = useState<PatientDto | null | undefined>(undefined);
  const [selectedPatient, setSelectedPatient] = useState<PatientDto | null>(null);

  const patientsQuery = useQuery({
    queryKey: ['patients', search, includeArchived, coachId],
    queryFn: () =>
      unwrap(
        window.ajnutrition.patient.list({
          ...(search ? { search } : {}),
          ...(includeArchived ? { includeArchived: true } : {}),
          ...(coachId ? { coachId } : {}),
        }),
      ),
    enabled: selectedPatient === null,
  });

  // Populates the filter only. Active coaches, since those are the ones she
  // is working with; a patient still linked to an archived coach is reachable
  // from their own expediente.
  const coachesQuery = useQuery({
    queryKey: ['coaches', '', false],
    queryFn: () => unwrap(window.ajnutrition.coach.list({})),
  });

  const statusMutation = useMutation({
    mutationFn: (variables: { patientId: string; status: 'active' | 'archived' }) =>
      unwrap(window.ajnutrition.patient.setStatus(variables)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['patients'] }),
  });

  if (selectedPatient !== null) {
    return <PatientWorkspace patient={selectedPatient} onBack={() => setSelectedPatient(null)} />;
  }

  const patients = patientsQuery.data ?? [];
  const { totalPages, safePage, pageItems } = paginate(patients, page, PAGE_SIZE);
  const statusError = statusMutation.error instanceof ApiError ? statusMutation.error : null;

  return (
    <section aria-labelledby="patients-heading">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 id="patients-heading" className="text-lg font-semibold">
          {t('patients.heading')}
        </h2>
        <button
          type="button"
          onClick={() => setEditor(null)}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus:outline-2 focus:outline-offset-2 focus:outline-emerald-700"
        >
          {t('patients.newPatient')}
        </button>
      </div>

      {editor !== undefined && (
        <Modal
          icon="👥"
          title={editor === null ? t('patients.newPatient') : t('patients.editPatient')}
          onClose={() => setEditor(undefined)}
        >
          <PatientForm
            patient={editor ?? undefined}
            onCreated={() => setEditor(undefined)}
            key={editor?.id ?? 'new'}
          />
        </Modal>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="patient-search" className="mb-1 block text-sm font-medium text-slate-700">
            {t('patients.searchLabel')}
          </label>
          <input
            id="patient-search"
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder={t('patients.searchPlaceholder')}
            className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-2 focus:outline-emerald-700"
          />
        </div>
        <div>
          <label htmlFor="patient-coach" className="mb-1 block text-sm font-medium text-slate-700">
            {t('patients.coachFilter')}
          </label>
          <select
            id="patient-coach"
            value={coachId}
            onChange={(e) => {
              setCoachId(e.target.value);
              setPage(0);
            }}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-2 focus:outline-emerald-700"
          >
            <option value="">{t('patients.coachFilterAll')}</option>
            {(coachesQuery.data ?? []).map((coach) => (
              <option key={coach.id} value={coach.id}>
                {coach.displayName}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => {
              setIncludeArchived(e.target.checked);
              setPage(0);
            }}
            className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500"
          />
          {t('patients.includeArchived')}
        </label>
      </div>

      {statusError && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {statusError.message}
        </p>
      )}

      {patientsQuery.isLoading && <p className="text-sm text-slate-500">{t('patients.loading')}</p>}
      {patientsQuery.isError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {t('patients.loadError', { message: (patientsQuery.error as Error).message })}
        </div>
      )}
      {patientsQuery.data && (
        <>
          <PatientTable
            patients={pageItems}
            onSelect={setSelectedPatient}
            onEdit={setEditor}
            onSetStatus={(patient) =>
              statusMutation.mutate({
                patientId: patient.id,
                status: patient.status === 'archived' ? 'active' : 'archived',
              })
            }
          />
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-slate-500">
                {t('patients.pageOf', {
                  page: safePage + 1,
                  pages: totalPages,
                  total: patients.length,
                })}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage(safePage - 1)}
                  disabled={safePage === 0}
                  className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
                >
                  ← {t('patients.prevPage')}
                </button>
                <button
                  type="button"
                  onClick={() => setPage(safePage + 1)}
                  disabled={safePage >= totalPages - 1}
                  className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
                >
                  {t('patients.nextPage')} →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
