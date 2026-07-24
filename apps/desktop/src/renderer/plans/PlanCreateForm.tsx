import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { REE_FORMULA_LABELS, type ReeFormulaIdDto } from '@ajnutrition/shared';
import type { MealPlanDto, PatientDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';

interface FormState {
  name: string;
  days: string;
  basisType: 'measurement' | 'manual';
  sessionId: string;
  reeFormulaId: string;
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
  reeFormulaId: 'mifflin_st_jeor_ree',
  pal: '1.55',
  adjustmentKcal: '0',
  manualEnergy: '',
  proteinPct: '20',
  carbPct: '50',
  fatPct: '30',
};

/** Plan creation form, scoped to a consultation when consultationId is given. */
export function PlanCreateForm({
  patient,
  consultationId,
  onCreated,
}: {
  patient: PatientDto;
  consultationId?: string | undefined;
  onCreated: (plan: MealPlanDto) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);

  const sessionsQuery = useQuery({
    queryKey: ['measurements', patient.id],
    queryFn: () => unwrap(window.ajnutrition.measurement.list({ patientId: patient.id })),
  });

  const sessionsWithRee = (sessionsQuery.data ?? [])
    .map((session) => ({
      session,
      reeOptions: session.calculated.filter(
        (c) => c.formulaId in REE_FORMULA_LABELS && c.unit === 'kcal/día',
      ),
    }))
    .filter((entry) => entry.reeOptions.length > 0);

  const selectedSession = sessionsWithRee.find((e) => e.session.id === form.sessionId);
  const selectedRee = selectedSession?.reeOptions.find((c) => c.formulaId === form.reeFormulaId);

  const createMutation = useMutation({
    mutationFn: () => {
      const num = (v: string) => Number(v.trim().replace(',', '.'));
      return unwrap(
        window.ajnutrition.plan.create({
          patientId: patient.id,
          name: form.name,
          days: Number(form.days),
          ...(consultationId === undefined ? {} : { consultationId }),
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
                  reeFormulaId: form.reeFormulaId as ReeFormulaIdDto,
                  pal: num(form.pal),
                  adjustmentKcal: Math.round(num(form.adjustmentKcal) || 0),
                }
              : { type: 'manual', energyKcal: num(form.manualEnergy) },
        }),
      );
    },
    onSuccess: async (plan) => {
      await queryClient.invalidateQueries({ queryKey: ['plans', patient.id] });
      setForm(EMPTY);
      onCreated(plan);
    },
  });

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
    <form
      onSubmit={(e) => {
        e.preventDefault();
        createMutation.mutate();
      }}
      noValidate
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
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label htmlFor="plan-session" className="mb-1 block text-sm font-medium">
                {t('plans.session')}
              </label>
              <select
                id="plan-session"
                value={form.sessionId}
                onChange={(e) => {
                  const next = sessionsWithRee.find((s) => s.session.id === e.target.value);
                  const keep = next?.reeOptions.some((c) => c.formulaId === form.reeFormulaId);
                  setForm({
                    ...form,
                    sessionId: e.target.value,
                    reeFormulaId: keep
                      ? form.reeFormulaId
                      : (next?.reeOptions[0]?.formulaId ?? 'mifflin_st_jeor_ree'),
                  });
                }}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {sessionsWithRee.map(({ session }) => (
                  <option key={session.id} value={session.id}>
                    {session.measuredAt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="plan-formula" className="mb-1 block text-sm font-medium">
                {t('plans.reeFormula')}
              </label>
              <select
                id="plan-formula"
                value={form.reeFormulaId}
                onChange={(e) => setForm({ ...form, reeFormulaId: e.target.value })}
                disabled={selectedSession === undefined}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
              >
                {(selectedSession?.reeOptions ?? []).map((c) => (
                  <option key={c.formulaId} value={c.formulaId}>
                    {REE_FORMULA_LABELS[c.formulaId as keyof typeof REE_FORMULA_LABELS] ??
                      c.formulaId}{' '}
                    · {c.roundedResult} kcal
                  </option>
                ))}
              </select>
              {selectedRee !== undefined && selectedRee.warnings.length > 0 && (
                <p className="mt-1 text-xs text-amber-700">{t('plans.reeFormulaWarning')}</p>
              )}
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
  );
}
