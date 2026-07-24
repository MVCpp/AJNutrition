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
import { Modal } from '../components/Modal';
import { PhotoImage } from '../photos/PhotoImage';
import { PhotoViewer } from '../photos/PhotoViewer';
import { PlanCreateForm } from '../plans/PlanCreateForm';

const PHOTO_KIND_ICONS: Record<PhotoKind, string> = {
  front: '🧍',
  side_left: '🚶',
  side_right: '🚶',
  back: '🧍',
};
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

function SectionShell({
  icon,
  title,
  count,
  actionLabel,
  onAction,
  children,
}: {
  icon: string;
  title: string;
  count: number;
  actionLabel: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-slate-100 px-6 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <span aria-hidden="true">{icon}</span>
          {title}
          {count > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500 tabular-nums">
              {count}
            </span>
          )}
        </h4>
        <button
          type="button"
          onClick={onAction}
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition-colors hover:border-emerald-300 hover:bg-emerald-100"
        >
          + {actionLabel}
        </button>
      </div>
      {children}
    </section>
  );
}

/** 📏 Mediciones of one consultation: list + modal capture. */
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
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    measuredAt: consultation.consultationDate,
    weightKg: '',
    heightCm: '',
    waistCm: '',
    hipCm: '',
    bodyFatPercent: '',
  });

  // Short one-line labels — the unit lives in the input suffix, never in the
  // label, so the grid rows stay perfectly aligned.
  const fields = [
    ['weightKg', 'measurements.shortWeight', 'kg'],
    ['heightCm', 'measurements.shortHeight', 'cm'],
    ['waistCm', 'measurements.shortWaist', 'cm'],
    ['hipCm', 'measurements.shortHip', 'cm'],
    ['bodyFatPercent', 'measurements.shortBodyFat', '%'],
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
      setOpen(false);
      setForm({ ...form, weightKg: '', heightCm: '', waistCm: '', hipCm: '', bodyFatPercent: '' });
      createMutation.reset();
    },
  });

  const error = errorText(createMutation.error);
  const hasAnyValue = fields.some(([key]) => form[key].trim() !== '');

  return (
    <SectionShell
      icon="📏"
      title={t('consultations.linkedMeasurements')}
      count={sessions.length}
      actionLabel={t('consultations.addMeasurement')}
      onAction={() => setOpen(true)}
    >
      {sessions.length === 0 ? (
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
                className="flex flex-wrap items-center gap-2 rounded-lg bg-violet-50/60 px-3 py-2 text-sm"
              >
                <span className="font-medium text-slate-800">{session.measuredAt}</span>
                <span className="text-xs text-slate-600">{values.join(' · ')}</span>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <Modal
          icon="📏"
          title={t('consultations.addMeasurement')}
          subtitle={t('consultations.modalScope', { date: consultation.consultationDate })}
          onClose={() => setOpen(false)}
          footer={
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100"
              >
                {t('consultations.cancel')}
              </button>
              <button
                type="submit"
                form="measurement-modal-form"
                disabled={createMutation.isPending || !hasAnyValue}
                className="rounded-md bg-emerald-700 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
              >
                {createMutation.isPending ? t('measurements.saving') : t('measurements.save')}
              </button>
            </div>
          }
        >
          <form
            id="measurement-modal-form"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
            noValidate
          >
            {error && (
              <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
                {error}
              </p>
            )}
            <div className="mb-5 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <label htmlFor="mm-date" className="text-sm font-medium text-slate-700">
                {t('measurements.date')}
              </label>
              <input
                id="mm-date"
                type="date"
                value={form.measuredAt}
                onChange={(e) => setForm({ ...form, measuredAt: e.target.value })}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              {fields.map(([key, labelKey, unit], index) => (
                <div
                  key={key}
                  className={`flex items-center justify-between gap-4 px-4 py-2.5 ${
                    index > 0 ? 'border-t border-slate-100' : ''
                  } ${index % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}`}
                >
                  <label htmlFor={`mm-${key}`} className="text-sm font-medium text-slate-700">
                    {t(labelKey)}
                    {key === 'bodyFatPercent' && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-400">
                        {t('measurements.optionalTag')}
                      </span>
                    )}
                  </label>
                  <div className="relative w-36">
                    <input
                      id={`mm-${key}`}
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      autoFocus={key === 'weightKg'}
                      value={form[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 py-2 pl-3 pr-11 text-right text-base tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex w-6 items-center justify-end text-sm text-slate-400">
                      {unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">{t('consultations.measurementModalHint')}</p>
          </form>
        </Modal>
      )}
    </SectionShell>
  );
}

/** 🍽 Plan of one consultation: list + modal creation + open editor. */
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
  const [open, setOpen] = useState(false);

  return (
    <SectionShell
      icon="🍽"
      title={t('consultations.linkedPlans')}
      count={plans.length}
      actionLabel={t('consultations.createPlan')}
      onAction={() => setOpen(true)}
    >
      {plans.length === 0 ? (
        <p className="text-xs text-slate-400">{t('consultations.noLinkedPlans')}</p>
      ) : (
        <ul className="space-y-1">
          {plans.map((plan) => (
            <li key={plan.id}>
              <button
                type="button"
                onClick={() => onOpenPlan(plan.id)}
                className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-emerald-50/60 px-3 py-2 text-left text-sm transition-colors hover:bg-emerald-100/70"
              >
                <span className="font-medium text-emerald-900">{plan.name}</span>
                <span className="text-xs text-slate-500">
                  {plan.days} {t('plans.days').toLowerCase()} · {plan.energyTargetKcal} kcal
                </span>
                <span className={statusChipClass(plan.status)}>
                  {t(`plans.status.${plan.status}`)}
                </span>
                <span className="ml-auto text-xs font-medium text-emerald-800">
                  {t('consultations.openPlan')} →
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <Modal
          icon="🍽"
          title={t('consultations.createPlan')}
          subtitle={t('consultations.modalScope', { date: consultation.consultationDate })}
          onClose={() => setOpen(false)}
          wide
        >
          <PlanCreateForm
            patient={patient}
            consultationId={consultation.id}
            onCreated={(plan) => {
              setOpen(false);
              onOpenPlan(plan.id);
            }}
          />
        </Modal>
      )}
    </SectionShell>
  );
}

/** 📷 Progress photos of one consultation: thumbnails + modal upload. */
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
  const [open, setOpen] = useState(false);
  const [capturedAt, setCapturedAt] = useState(consultation.consultationDate);
  const [lastAdded, setLastAdded] = useState<PhotoKind | null>(null);
  const [viewing, setViewing] = useState<PhotoDto | null>(null);

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
    onSuccess: async (result, kind) => {
      await invalidate();
      if (!result.canceled) setLastAdded(kind);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (photoId: string) => unwrap(window.ajnutrition.photo.delete({ photoId })),
    onSuccess: invalidate,
  });

  const error = errorText(addMutation.error) ?? errorText(deleteMutation.error);
  const countByKind = new Map<PhotoKind, number>();
  for (const photo of photos) {
    countByKind.set(photo.kind, (countByKind.get(photo.kind) ?? 0) + 1);
  }

  return (
    <SectionShell
      icon="📷"
      title={t('consultations.linkedPhotos')}
      count={photos.length}
      actionLabel={t('consultations.addPhotos')}
      onAction={() => setOpen(true)}
    >
      {error && !open && (
        <p role="alert" className="mb-2 rounded-md bg-red-50 p-2 text-xs text-red-800">
          {error}
        </p>
      )}

      {photos.length === 0 ? (
        <p className="text-xs text-slate-400">{t('consultations.noLinkedPhotos')}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {photos.map((photo) => (
            <li key={photo.id} className="group">
              <button
                type="button"
                onClick={() => setViewing(photo)}
                title={t('photos.openViewer')}
                className="block w-full overflow-hidden rounded-lg ring-emerald-400 transition-shadow focus:outline-none focus:ring-2 hover:ring-2"
              >
                <PhotoImage
                  photoId={photo.id}
                  alt={t(`photos.kinds.${photo.kind}`)}
                  className="h-32 w-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
              </button>
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
                  className="text-xs text-red-700 opacity-0 underline-offset-2 transition-opacity hover:underline group-hover:opacity-100 disabled:opacity-50"
                >
                  {t('photos.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {viewing !== null && (
        <PhotoViewer
          photoId={viewing.id}
          caption={`${t(`photos.kinds.${viewing.kind}`)} · ${viewing.capturedAt}`}
          onClose={() => setViewing(null)}
        />
      )}

      {open && (
        <Modal
          icon="📷"
          title={t('consultations.addPhotos')}
          subtitle={t('consultations.modalScope', { date: consultation.consultationDate })}
          onClose={() => {
            setOpen(false);
            setLastAdded(null);
            addMutation.reset();
          }}
          footer={
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">{t('photos.encryptedNote')}</p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setLastAdded(null);
                  addMutation.reset();
                }}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
              >
                {t('consultations.done')}
              </button>
            </div>
          }
        >
          {!photoConsentActive && consentsQuery.isSuccess && (
            <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {t('photos.consentMissing')}
            </p>
          )}
          {error && (
            <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}
          {lastAdded !== null && (
            <p
              role="status"
              className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
            >
              ✓ {t('consultations.photoAdded', { kind: t(`photos.kinds.${lastAdded}`) })}
            </p>
          )}

          <div className="mb-5">
            <label htmlFor="pm-date" className="mb-1 block text-sm font-medium">
              {t('photos.date')}
            </label>
            <input
              id="pm-date"
              type="date"
              value={capturedAt}
              onChange={(e) => setCapturedAt(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <p className="mb-2 text-sm font-medium text-slate-700">
            {t('consultations.pickPhotoKind')}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PHOTO_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                disabled={!photoConsentActive || addMutation.isPending}
                onClick={() => addMutation.mutate(kind)}
                className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 px-3 py-5 text-sm text-slate-600 transition-colors hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span aria-hidden="true" className="text-2xl">
                  {PHOTO_KIND_ICONS[kind]}
                </span>
                <span className="font-medium">{t(`photos.kinds.${kind}`)}</span>
                {(countByKind.get(kind) ?? 0) > 0 && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                    {countByKind.get(kind)} ✓
                  </span>
                )}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </SectionShell>
  );
}
