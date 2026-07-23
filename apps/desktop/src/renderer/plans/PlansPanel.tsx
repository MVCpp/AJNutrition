import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { MealPlanSummaryDto, PatientDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';
import { PlanEditor } from './PlanEditor';

interface FormState {
  name: string;
  days: string;
  basisType: 'measurement' | 'manual';
  sessionId: string;
  pal: string;
  adjustmentKcal: string;
  manualEnergy: string;
  proteinPct: string;
  carbPct: string;
  fatPct: string;
}

const EMPTY: FormState = {
  name: '',
  days: '1',
  basisType: 'measurement',
  sessionId: '',
  pal: '1.55',
  adjustmentKcal: '0',
  manualEnergy: '',
  proteinPct: '20',
  carbPct: '50',
  fatPct: '30',
};

export function PlansPanel({ patient }: { patient: PatientDto }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const plansQuery = useQuery({
    queryKey: ['plans', patient.id],
    queryFn: () => unwrap(window.ajnutrition.plan.list({ patientId: patient.id })),
  });

  const sessionsQuery = useQuery({
    queryKey: ['measurements', patient.id],
    queryFn: () => unwrap(window.ajnutrition.measurement.list({ patientId: patient.id })),
  });

  const sessionsWithRee = (sessionsQuery.data ?? [])
    .map((session) => ({
      session,
      ree: session.calculated.find((c) => c.formulaId === 'mifflin_st_jeor_ree'),
    }))
    .filter((entry) => entry.ree !== undefined);

  const createMutation = useMutation({
    mutationFn: () => {
      const num = (v: string) => Number(v.trim().replace(',', '.'));
      return unwrap(
        window.ajnutrition.plan.create({
          patientId: patient.id,
          name: form.name,
          days: Number(form.days),
          macros: {
            proteinPct: num(form.proteinPct),
            carbohydratePct: num(form.carbPct),
            fatPct: num(form.fatPct),
          },
          basis:
            form.basisType === 'measurement'
              ? {
                  type: 'measurement',
                  sessionId: form.sessionId,
                  pal: num(form.pal),
                  adjustmentKcal: Math.round(num(form.adjustmentKcal) || 0),
                }
              : { type: 'manual', energyKcal: num(form.manualEnergy) },
        }),
      );
    },
    onSuccess: async (plan) => {
      await queryClient.invalidateQueries({ queryKey: ['plans', patient.id] });
      setShowForm(false);
      setForm(EMPTY);
      setOpenPlanId(plan.id);
    },
  });

  if (openPlanId !== null) {
    return <PlanEditor planId={openPlanId} onBack={() => setOpenPlanId(null)} />;
  }

  const errorMessage =
    createMutation.error instanceof ApiError
      ? `${createMutation.error.message} (${createMutation.error.detail.supportCode})`
      : null;

  const macroSum =
    (Number(form.proteinPct) || 0) + (Number(form.carbPct) || 0) + (Number(form.fatPct) || 0);
  const canSave =
    form.name.trim() !== '' &&
    Math.abs(macroSum - 100) <= 1 &&
    (form.basisType === 'manual' ? form.manualEnergy.trim() !== '' : form.sessionId !== '');

  return (
    <div>
      <div className="mb-6 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {showForm ? t('plans.closeForm') : t('plans.new')}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          noValidate
          className="mb-8 rounded-lg border border-slate-200 bg-white p-6"
        >
          {errorMessage && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {errorMessage}
            </div>
          )}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="plan-name" className="mb-1 block text-sm font-medium">
                {t('plans.name')}
              </label>
              <input
                id="plan-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="plan-days" className="mb-1 block text-sm font-medium">
                {t('plans.days')}
              </label>
              <select
                id="plan-days"
                value={form.days}
                onChange={(e) => setForm({ ...form, days: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-4 flex gap-4">
            {(['measurement', 'manual'] as const).map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="basis"
                  checked={form.basisType === type}
                  onChange={() => setForm({ ...form, basisType: type })}
                />
                {t(type === 'measurement' ? 'plans.basisMeasurement' : 'plans.basisManual')}
              </label>
            ))}
          </div>

          {form.basisType === 'measurement' ? (
            sessionsWithRee.length === 0 ? (
              <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {t('plans.noSessions')}
              </p>
            ) : (
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="plan-session" className="mb-1 block text-sm font-medium">
                    {t('plans.session')}
                  </label>
                  <select
                    id="plan-session"
                    value={form.sessionId}
                    onChange={(e) => setForm({ ...form, sessionId: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">—</option>
                    {sessionsWithRee.map(({ session, ree }) => (
                      <option key={session.id} value={session.id}>
                        {t('plans.sessionOption', {
                          date: session.measuredAt,
                          ree: ree?.roundedResult,
                          version: ree?.formulaVersion,
                        })}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="plan-pal" className="mb-1 block text-sm font-medium">
                    {t('plans.pal')}
                  </label>
                  <input
                    id="plan-pal"
                    type="text"
                    inputMode="decimal"
                    value={form.pal}
                    onChange={(e) => setForm({ ...form, pal: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-slate-500">{t('plans.palHint')}</p>
                </div>
                <div>
                  <label htmlFor="plan-adjust" className="mb-1 block text-sm font-medium">
                    {t('plans.adjustment')}
                  </label>
                  <input
                    id="plan-adjust"
                    type="text"
                    inputMode="numeric"
                    value={form.adjustmentKcal}
                    onChange={(e) => setForm({ ...form, adjustmentKcal: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )
          ) : (
            <div className="mb-4 max-w-xs">
              <label htmlFor="plan-energy" className="mb-1 block text-sm font-medium">
                {t('plans.manualEnergy')}
              </label>
              <input
                id="plan-energy"
                type="text"
                inputMode="numeric"
                value={form.manualEnergy}
                onChange={(e) => setForm({ ...form, manualEnergy: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          )}

          <h3 className="mb-2 text-xs font-medium uppercase text-slate-500">{t('plans.macros')}</h3>
          <div className="mb-2 grid grid-cols-3 gap-4 sm:max-w-md">
            {(
              [
                ['proteinPct', 'plans.proteinPct'],
                ['carbPct', 'plans.carbPct'],
                ['fatPct', 'plans.fatPct'],
              ] as const
            ).map(([key, labelKey]) => (
              <div key={key}>
                <label htmlFor={`plan-${key}`} className="mb-1 block text-sm font-medium">
                  {t(labelKey)}
                </label>
                <input
                  id={`plan-${key}`}
                  type="text"
                  inputMode="numeric"
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            ))}
          </div>
          <p
            className={
              Math.abs(macroSum - 100) <= 1
                ? 'mb-4 text-xs text-slate-500'
                : 'mb-4 text-xs text-red-700'
            }
          >
            {t('plans.macrosSum', { sum: macroSum })}
          </p>

          <button
            type="submit"
            disabled={createMutation.isPending || !canSave}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {createMutation.isPending ? t('plans.saving') : t('plans.save')}
          </button>
        </form>
      )}

      {plansQuery.isLoading && <p className="text-sm text-slate-500">{t('plans.loading')}</p>}
      {plansQuery.isError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {t('plans.loadError', { message: (plansQuery.error as Error).message })}
        </div>
      )}
      {plansQuery.data && plansQuery.data.length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {t('plans.empty')}
        </div>
      )}

      <ul className="space-y-2">
        {plansQuery.data?.map((plan: MealPlanSummaryDto) => (
          <li key={plan.id}>
            <button
              type="button"
              onClick={() => setOpenPlanId(plan.id)}
              className="w-full rounded-md border border-slate-200 bg-white p-4 text-left hover:border-emerald-300"
            >
              <span className="text-sm font-medium text-emerald-800">{plan.name}</span>
              <span className="ml-3 text-xs text-slate-500">
                {t('plans.days')}: {plan.days} · {plan.energyTargetKcal} kcal ·{' '}
                {new Date(plan.createdAt).toLocaleDateString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
