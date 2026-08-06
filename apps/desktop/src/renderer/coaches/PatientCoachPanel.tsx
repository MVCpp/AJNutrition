import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PatientDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';
import { CoachSharingPanel } from './CoachSharingPanel';

/**
 * The patient's trainer, on their expediente (C-1).
 *
 * The wording here matters more than the widget: this records who the patient
 * trains with. It is not permission to send that trainer anything, and the
 * panel says so, because the gap between "I noted their coach" and "I may
 * share their file with their coach" is exactly where a privacy mistake would
 * happen.
 *
 * The authorisation that closes that gap is `CoachSharingPanel` below, and it
 * is deliberately a separate step with its own consent — never a checkbox on
 * the link.
 */
export function PatientCoachPanel({ patient }: { patient: PatientDto }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState('');

  const linkQuery = useQuery({
    queryKey: ['patient-coach', patient.id],
    queryFn: () => unwrap(window.ajnutrition.coach.forPatient({ patientId: patient.id })),
  });

  const coachesQuery = useQuery({
    queryKey: ['coaches', '', false],
    queryFn: () => unwrap(window.ajnutrition.coach.list({})),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['patient-coach', patient.id] });
    await queryClient.invalidateQueries({ queryKey: ['coaches'] });
  };

  const linkMutation = useMutation({
    mutationFn: (coachId: string) =>
      unwrap(window.ajnutrition.coach.link({ patientId: patient.id, coachId })),
    onSuccess: async () => {
      await invalidate();
      setChoice('');
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => unwrap(window.ajnutrition.coach.unlink({ linkId })),
    onSuccess: invalidate,
  });

  const error =
    linkMutation.error instanceof ApiError
      ? linkMutation.error
      : unlinkMutation.error instanceof ApiError
        ? unlinkMutation.error
        : null;

  const link = linkQuery.data ?? null;
  const coaches = coachesQuery.data ?? [];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-700">{t('coaches.panelHeading')}</h3>
      <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        {t('coaches.panelNotice')}
      </p>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error.message}
        </p>
      )}

      {linkQuery.isLoading && <p className="text-sm text-slate-500">{t('coaches.loading')}</p>}

      {!linkQuery.isLoading && link === null && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="patient-coach-select"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              {t('coaches.assignLabel')}
            </label>
            <select
              id="patient-coach-select"
              value={choice}
              onChange={(event) => setChoice(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-2 focus:outline-emerald-700"
            >
              <option value="">{t('coaches.assignPlaceholder')}</option>
              {coaches.map((coach) => (
                <option key={coach.id} value={coach.id}>
                  {coach.displayName}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={choice === '' || linkMutation.isPending}
            onClick={() => linkMutation.mutate(choice)}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {t('coaches.assign')}
          </button>
          {coaches.length === 0 && (
            <p className="text-sm text-slate-500">{t('coaches.noneRegistered')}</p>
          )}
        </div>
      )}

      {link !== null && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div>
            <p className="text-sm font-medium text-slate-800">{link.coachDisplayName}</p>
            <p className="text-xs text-slate-500">
              {t('coaches.linkedSince', { date: link.linkedAt.slice(0, 10) })}
              {link.coachStatus === 'archived' && ` · ${t('coaches.archived')}`}
            </p>
          </div>
          <button
            type="button"
            disabled={unlinkMutation.isPending}
            onClick={() => {
              if (!window.confirm(t('coaches.unlinkConfirm'))) return;
              unlinkMutation.mutate(link.id);
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {t('coaches.unlink')}
          </button>
        </div>
      )}

      {link !== null && <CoachSharingPanel patient={patient} link={link} />}
    </div>
  );
}
