import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  ConsultationDto,
  MealPlanSummaryDto,
  MeasurementSessionDto,
  PatientDto,
  PhotoDto,
  PhotoKind,
} from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';
import { PhotoImage } from '../photos/PhotoImage';
import { PlanCreateForm } from '../plans/PlanCreateForm';

const PHOTO_KINDS: PhotoKind[] = ['front', 'side_left', 'side_right', 'back'];

function errorText(error: unknown): string | null {
  if (error instanceof ApiError) return `${error.message} (${error.detail.supportCode})`;
  if (error instanceof Error) return error.message;
  return null;
}

function statusChipClass(status: MealPlanSummaryDto['status']): string {
  if (status === 'active')
    return 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800';
  if (status === 'archived') return 'rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600';
  return 'rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800';
}

/** 📏 Mediciones of one consultation: list + inline capture. */
export function ConsultationMeasurements({
  patient,
  consultation,
  sessions,
}: {
  patient: PatientDto;
  consultation: ConsultationDto;
  sessions: MeasurementSessionDto[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    measuredAt: consultation.consultationDate,
    weightKg: '',
    heightCm: '',
    waistCm: '',
    hipCm: '',
    bodyFatPercent: '',
  });

  const fields = [
    ['weightKg', 'measurements.weight'],
    ['heightCm', 'measurements.height'],
    ['waistCm', 'measurements.waist'],
    ['hipCm', 'measurements.hip'],
    ['bodyFatPercent', 'measurements.bodyFat'],
  ] as const;

  const createMutation = useMutation({
    mutationFn: () => {
      const parse = (value: string) => {
        const trimmed = value.trim().replace(',', '.');
        return trimmed === '' ? undefined : Number(trimmed);
      };
      return unwrap(
        window.ajnutrition.measurement.create({
          patientId: patient.id,
          measuredAt: form.measuredAt,
          weightKg: parse(form.weightKg),
          heightCm: parse(form.heightCm),
          waistCm: parse(form.waistCm),
          hipCm: parse(form.hipCm),
          bodyFatPercent: parse(form.bodyFatPercent),
          consultationId: consultation.id,
        }),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['measurements', patient.id] });
      setShowForm(false);
      setForm({ ...form, weightKg: '', heightCm: '', waistCm: '', hipCm: '', bodyFatPercent: '' });
    },
  });

  const error = errorText(createMutation.error);
  const hasAnyValue = fields.some(([key]) => form[key].trim() !== '');

  return (
    <section className="border-t border-slate-100 px-6 py-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-medium uppercase text-slate-500">
          📏 {t('consultations.linkedMeasurements')}
        </h4>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="text-xs text-emerald-800 underline-offset-2 hover:underline"
        >
          {showForm ? t('consultations.cancel') : `+ ${t('consultations.addMeasurement')}`}
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-2 rounded-md bg-red-50 p-2 text-xs text-red-800">
          {error}
        </p>
      )}

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          noValidate
          className="mb-3 flex flex-wrap items-end gap-2 rounded-md bg-violet-50/50 p-3"
        >
          <div>
            <label
              htmlFor={`cm-date-${consultation.id}`}
              className="mb-1 block text-xs font-medium"
            >
              {t('measurements.date')}
            </label>
            <input
              id={`cm-date-${consultation.id}`}
              type="date"
              value={form.measuredAt}
              onChange={(e) => setForm({ ...form, measuredAt: e.target.value })}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          {fields.map(([key, labelKey]) => (
            <div key={key}>
              <label
                htmlFor={`cm-${key}-${consultation.id}`}
                className="mb-1 block text-xs font-medium"
              >
                {t(labelKey)}
              </label>
              <input
                id={`cm-${key}-${consultation.id}`}
                type="text"
                inputMode="decimal"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          ))}
          <button
            type="submit"
            disabled={createMutation.isPending || !hasAnyValue}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {createMutation.isPending ? t('measurements.saving') : t('measurements.save')}
          </button>
        </form>
      )}

      {sessions.length === 0 && !showForm ? (
        <p className="text-xs text-slate-400">{t('consultations.noLinkedMeasurements')}</p>
      ) : (
        <ul className="space-y-1">
          {sessions.map((session) => {
            const bmiCalc = session.calculated.find((c) => c.formulaId === 'bmi');
            const ree = session.calculated.find((c) => c.formulaId === 'mifflin_st_jeor_ree');
            const values = [
              session.weightKg !== null ? `${session.weightKg} kg` : null,
              session.heightCm !== null ? `${session.heightCm} cm` : null,
              session.bodyFatPercent !== null ? `${session.bodyFatPercent} % grasa` : null,
              bmiCalc ? `IMC ${bmiCalc.roundedResult}` : null,
              ree ? `GER ${ree.roundedResult} kcal` : null,
            ].filter(Boolean);
            return (
              <li
                key={session.id}
                className="flex flex-wrap items-center gap-2 rounded-md bg-violet-50/60 px-3 py-1.5 text-sm"
              >
                <span className="font-medium text-slate-800">{session.measuredAt}</span>
                <span className="text-xs text-slate-600">{values.join(' · ')}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** 🍽 Plan of one consultation: list + create + open editor. */
export function ConsultationPlans({
  patient,
  consultation,
  plans,
  onOpenPlan,
}: {
  patient: PatientDto;
  consultation: ConsultationDto;
  plans: MealPlanSummaryDto[];
  onOpenPlan: (planId: string) => void;
}) {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);

  return (
    <section className="border-t border-slate-100 px-6 py-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-medium uppercase text-slate-500">
          🍽 {t('consultations.linkedPlans')}
        </h4>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="text-xs text-emerald-800 underline-offset-2 hover:underline"
        >
          {showForm ? t('consultations.cancel') : `+ ${t('consultations.createPlan')}`}
        </button>
      </div>

      {showForm && (
        <div className="mb-3 rounded-md bg-emerald-50/40 p-4">
          <PlanCreateForm
            patient={patient}
            consultationId={consultation.id}
            onCreated={(plan) => {
              setShowForm(false);
              onOpenPlan(plan.id);
            }}
          />
        </div>
      )}

      {plans.length === 0 && !showForm ? (
        <p className="text-xs text-slate-400">{t('consultations.noLinkedPlans')}</p>
      ) : (
        <ul className="space-y-1">
          {plans.map((plan) => (
            <li key={plan.id}>
              <button
                type="button"
                onClick={() => onOpenPlan(plan.id)}
                className="flex w-full flex-wrap items-center gap-2 rounded-md bg-emerald-50/60 px-3 py-1.5 text-left text-sm transition-colors hover:bg-emerald-100/70"
              >
                <span className="font-medium text-emerald-900">{plan.name}</span>
                <span className="text-xs text-slate-500">
                  {plan.days} {t('plans.days').toLowerCase()} · {plan.energyTargetKcal} kcal
                </span>
                <span className={statusChipClass(plan.status)}>
                  {t(`plans.status.${plan.status}`)}
                </span>
                <span className="ml-auto text-xs text-emerald-800 underline-offset-2 hover:underline">
                  {t('consultations.openPlan')} →
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 📷 Progress photos of one consultation: thumbnails + consent-gated upload. */
export function ConsultationPhotos({
  patient,
  consultation,
  photos,
}: {
  patient: PatientDto;
  consultation: ConsultationDto;
  photos: PhotoDto[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [capturedAt, setCapturedAt] = useState(consultation.consultationDate);

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
      unwrap(
        window.ajnutrition.photo.add({
          patientId: patient.id,
          kind,
          capturedAt,
          consultationId: consultation.id,
        }),
      ),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (photoId: string) => unwrap(window.ajnutrition.photo.delete({ photoId })),
    onSuccess: invalidate,
  });

  const error = errorText(addMutation.error) ?? errorText(deleteMutation.error);

  return (
    <section className="border-t border-slate-100 px-6 py-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-medium uppercase text-slate-500">
          📷 {t('consultations.linkedPhotos')}
        </h4>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            aria-label={t('photos.date')}
            type="date"
            value={capturedAt}
            onChange={(e) => setCapturedAt(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
          {PHOTO_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              disabled={!photoConsentActive || addMutation.isPending}
              onClick={() => addMutation.mutate(kind)}
              title={photoConsentActive ? t(`photos.kinds.${kind}`) : t('photos.consentMissing')}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              + {t(`photos.kinds.${kind}`)}
            </button>
          ))}
        </div>
      </div>

      {!photoConsentActive && consentsQuery.isSuccess && (
        <p className="mb-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
          {t('photos.consentMissing')}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-2 rounded-md bg-red-50 p-2 text-xs text-red-800">
          {error}
        </p>
      )}

      {photos.length === 0 ? (
        <p className="text-xs text-slate-400">{t('consultations.noLinkedPhotos')}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {photos.map((photo) => (
            <li key={photo.id}>
              <PhotoImage
                photoId={photo.id}
                alt={t(`photos.kinds.${photo.kind}`)}
                className="h-32 w-full rounded-md object-cover"
              />
              <div className="mt-0.5 flex items-center justify-between px-0.5">
                <span className="text-xs text-slate-500">
                  {t(`photos.kinds.${photo.kind}`)} · {photo.capturedAt}
                </span>
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
      )}
    </section>
  );
}
