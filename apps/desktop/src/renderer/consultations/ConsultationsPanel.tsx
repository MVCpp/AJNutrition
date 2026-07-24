import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ConsultationDto, PatientDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';
import { ConsultationForm } from './ConsultationForm';
import { ConsultationCard } from './ConsultationCard';
import {
  ConsultationMeasurements,
  ConsultationPhotos,
  ConsultationPlans,
} from './ConsultationSections';
import { PlanEditor } from '../plans/PlanEditor';

const TYPE_KEYS = {
  initial: 'consultations.typeInitial',
  follow_up: 'consultations.typeFollowUp',
  other: 'consultations.typeOther',
} as const;

/**
 * Consultation-centric timeline (the user's mental model): every consultation
 * is a row, newest first; expanding one shows its notes, mediciones, plan and
 * progress photos — and everything is captured from inside the consultation.
 */
export function ConsultationsPanel({ patient }: { patient: PatientDto }) {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);

  const plansQuery = useQuery({
    queryKey: ['plans', patient.id],
    queryFn: () => unwrap(window.ajnutrition.plan.list({ patientId: patient.id })),
  });
  const photosQuery = useQuery({
    queryKey: ['photos', patient.id],
    queryFn: () => unwrap(window.ajnutrition.photo.list({ patientId: patient.id })),
  });
  const measurementsQuery = useQuery({
    queryKey: ['measurements', patient.id],
    queryFn: () => unwrap(window.ajnutrition.measurement.list({ patientId: patient.id })),
  });
  const consultationsQuery = useQuery({
    queryKey: ['consultations', patient.id],
    queryFn: () => unwrap(window.ajnutrition.consultation.list({ patientId: patient.id })),
  });

  if (openPlanId !== null) {
    return <PlanEditor planId={openPlanId} onBack={() => setOpenPlanId(null)} />;
  }

  const unlinkedPlans = (plansQuery.data ?? []).filter((p) => p.consultationId === null);
  const unlinkedPhotos = (photosQuery.data ?? []).filter((p) => p.consultationId === null);
  const unlinkedMeasurements = (measurementsQuery.data ?? []).filter(
    (m) => m.consultationId === null,
  );
  const hasUnlinked =
    unlinkedPlans.length > 0 || unlinkedPhotos.length > 0 || unlinkedMeasurements.length > 0;

  return (
    <section aria-label={t('workspace.tabConsultations')}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{t('consultations.timelineHint')}</p>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className={
            showForm
              ? 'rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100'
              : 'rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800'
          }
        >
          {showForm ? t('consultations.closeForm') : t('consultations.new')}
        </button>
      </div>

      {showForm && (
        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
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
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-600">{t('consultations.empty')}</p>
        </div>
      )}

      <ol className="space-y-2">
        {consultationsQuery.data?.map((consultation: ConsultationDto) => {
          const plans = (plansQuery.data ?? []).filter((p) => p.consultationId === consultation.id);
          const photos = (photosQuery.data ?? []).filter(
            (p) => p.consultationId === consultation.id,
          );
          const measurements = (measurementsQuery.data ?? []).filter(
            (m) => m.consultationId === consultation.id,
          );
          const isOpen = openId === consultation.id;
          return (
            <li key={consultation.id}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : consultation.id)}
                aria-expanded={isOpen}
                className={
                  isOpen
                    ? 'flex w-full flex-wrap items-center gap-3 rounded-t-xl border border-b-0 border-emerald-200 bg-emerald-50/50 px-4 py-3 text-left'
                    : 'flex w-full flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/30'
                }
              >
                <span className="text-sm font-semibold text-slate-800">
                  {consultation.consultationDate}
                </span>
                <span className="text-xs text-slate-500">
                  {t(TYPE_KEYS[consultation.consultationType])}
                </span>
                <span
                  className={
                    consultation.status === 'signed'
                      ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800'
                      : 'rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800'
                  }
                >
                  {consultation.status === 'signed'
                    ? t('consultations.signed')
                    : t('consultations.draft')}
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
                  {plans.length > 0 ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
                      🍽 {plans[0]?.name}
                      {plans.length > 1 ? ` +${plans.length - 1}` : ''}
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-400">
                      {t('consultations.rowNoPlan')}
                    </span>
                  )}
                  {photos.length > 0 && (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">
                      📷 {t('consultations.rowPhotos', { count: photos.length })}
                    </span>
                  )}
                  {measurements.length > 0 && (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-800">
                      📏 {t('consultations.rowMeasurements', { count: measurements.length })}
                    </span>
                  )}
                  <span className="text-slate-400">{isOpen ? '▴' : '▾'}</span>
                </span>
              </button>
              {isOpen && (
                <div className="overflow-hidden rounded-b-xl border border-t-0 border-emerald-200">
                  <ConsultationCard consultation={consultation} />
                  <ConsultationMeasurements
                    patient={patient}
                    consultation={consultation}
                    sessions={measurements}
                  />
                  <ConsultationPlans
                    patient={patient}
                    consultation={consultation}
                    plans={plans}
                    onOpenPlan={setOpenPlanId}
                  />
                  <ConsultationPhotos
                    patient={patient}
                    consultation={consultation}
                    photos={photos}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {hasUnlinked && (
        <details className="mt-6 rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm text-slate-500 hover:text-slate-700">
            {t('consultations.unlinkedHeading', {
              count: unlinkedPlans.length + unlinkedPhotos.length + unlinkedMeasurements.length,
            })}
          </summary>
          <div className="space-y-2 border-t border-slate-100 px-4 py-3 text-sm">
            {unlinkedPlans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setOpenPlanId(plan.id)}
                className="flex w-full flex-wrap items-center gap-2 rounded-md bg-slate-50 px-3 py-1.5 text-left hover:bg-emerald-50"
              >
                🍽 <span className="font-medium">{plan.name}</span>
                <span className="text-xs text-slate-500">{plan.energyTargetKcal} kcal</span>
              </button>
            ))}
            {unlinkedMeasurements.map((session) => (
              <p key={session.id} className="rounded-md bg-slate-50 px-3 py-1.5">
                📏 {session.measuredAt}
                {session.weightKg !== null && (
                  <span className="ml-2 text-xs text-slate-500">{session.weightKg} kg</span>
                )}
              </p>
            ))}
            {unlinkedPhotos.length > 0 && (
              <p className="rounded-md bg-slate-50 px-3 py-1.5">
                📷 {t('consultations.rowPhotos', { count: unlinkedPhotos.length })}
              </p>
            )}
          </div>
        </details>
      )}
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
