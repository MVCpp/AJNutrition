import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ConsultationDto, PatientDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';
import { ConsultationForm } from './ConsultationForm';
import { ConsultationCard } from './ConsultationCard';

export function ConsultationsPanel({ patient }: { patient: PatientDto }) {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);

  const plansQuery = useQuery({
    queryKey: ['plans', patient.id],
    queryFn: () => unwrap(window.ajnutrition.plan.list({ patientId: patient.id })),
  });
  const photosQuery = useQuery({
    queryKey: ['photos', patient.id],
    queryFn: () => unwrap(window.ajnutrition.photo.list({ patientId: patient.id })),
  });

  const consultationsQuery = useQuery({
    queryKey: ['consultations', patient.id],
    queryFn: () => unwrap(window.ajnutrition.consultation.list({ patientId: patient.id })),
  });

  return (
    <section aria-label={t('workspace.tabConsultations')}>
      <div className="mb-6 flex items-center justify-end gap-4">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {showForm ? t('consultations.closeForm') : t('consultations.new')}
        </button>
      </div>

      {showForm && (
        <div className="mb-8 rounded-lg border border-slate-200 bg-white p-6">
          <ConsultationForm patientId={patient.id} onCreated={() => setShowForm(false)} />
        </div>
      )}

      {consultationsQuery.isLoading && (
        <p className="text-sm text-slate-500">{t('consultations.loading')}</p>
      )}
      {consultationsQuery.isError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {t('consultations.loadError', {
            message: (consultationsQuery.error as Error).message,
          })}
        </div>
      )}
      {consultationsQuery.data && consultationsQuery.data.length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {t('consultations.empty')}
        </div>
      )}
      <div className="space-y-4">
        {consultationsQuery.data?.map((consultation: ConsultationDto) => (
          <ConsultationCard
            key={consultation.id}
            consultation={consultation}
            plans={(plansQuery.data ?? []).filter((p) => p.consultationId === consultation.id)}
            photos={(photosQuery.data ?? []).filter((p) => p.consultationId === consultation.id)}
          />
        ))}
      </div>
    </section>
  );
}

export function useConsultationMutation<TCommand>(
  patientId: string,
  mutationFn: (command: TCommand) => Promise<ConsultationDto>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consultations', patientId] }),
  });
}

export function mutationErrorMessage(error: unknown): string | null {
  if (error instanceof ApiError) return `${error.message} (${error.detail.supportCode})`;
  if (error instanceof Error) return error.message;
  return null;
}
