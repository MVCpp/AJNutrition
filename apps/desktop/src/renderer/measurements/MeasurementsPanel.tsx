import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { MeasurementSessionDto, PatientDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';

interface FormState {
  measuredAt: string;
  weightKg: string;
  heightCm: string;
  waistCm: string;
  hipCm: string;
  notes: string;
}

const NUMERIC_FIELDS = [
  ['weightKg', 'measurements.weight'],
  ['heightCm', 'measurements.height'],
  ['waistCm', 'measurements.waist'],
  ['hipCm', 'measurements.hip'],
] as const;

export function MeasurementsPanel({ patient }: { patient: PatientDto }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>({
    measuredAt: today,
    weightKg: '',
    heightCm: '',
    waistCm: '',
    hipCm: '',
    notes: '',
  });

  const sessionsQuery = useQuery({
    queryKey: ['measurements', patient.id],
    queryFn: () => unwrap(window.ajnutrition.measurement.list({ patientId: patient.id })),
  });

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
          notes: form.notes.trim() ? form.notes : undefined,
        }),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['measurements', patient.id] });
      setShowForm(false);
      setForm({ measuredAt: today, weightKg: '', heightCm: '', waistCm: '', hipCm: '', notes: '' });
    },
  });

  const errorMessage =
    createMutation.error instanceof ApiError
      ? `${createMutation.error.message} (${createMutation.error.detail.supportCode})`
      : null;

  const hasAnyValue = NUMERIC_FIELDS.some(([key]) => form[key].trim() !== '');

  return (
    <div>
      <div className="mb-6 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {showForm ? t('measurements.closeForm') : t('measurements.new')}
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
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div>
              <label htmlFor="m-date" className="mb-1 block text-sm font-medium">
                {t('measurements.date')}
              </label>
              <input
                id="m-date"
                type="date"
                value={form.measuredAt}
                max={today}
                onChange={(e) => setForm({ ...form, measuredAt: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            {NUMERIC_FIELDS.map(([key, labelKey]) => (
              <div key={key}>
                <label htmlFor={`m-${key}`} className="mb-1 block text-sm font-medium">
                  {t(labelKey)}
                </label>
                <input
                  id={`m-${key}`}
                  type="text"
                  inputMode="decimal"
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            ))}
          </div>
          <div className="mb-4">
            <label htmlFor="m-notes" className="mb-1 block text-sm font-medium">
              {t('measurements.notes')}
            </label>
            <textarea
              id="m-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          {!hasAnyValue && (
            <p className="mb-3 text-xs text-slate-500">{t('measurements.atLeastOne')}</p>
          )}
          <button
            type="submit"
            disabled={createMutation.isPending || !hasAnyValue}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {createMutation.isPending ? t('measurements.saving') : t('measurements.save')}
          </button>
        </form>
      )}

      {sessionsQuery.isLoading && (
        <p className="text-sm text-slate-500">{t('measurements.loading')}</p>
      )}
      {sessionsQuery.isError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {t('measurements.loadError', { message: (sessionsQuery.error as Error).message })}
        </div>
      )}
      {sessionsQuery.data && sessionsQuery.data.length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {t('measurements.empty')}
        </div>
      )}

      <div className="space-y-4">
        {sessionsQuery.data?.map((session: MeasurementSessionDto) => (
          <article key={session.id} className="rounded-lg border border-slate-200 bg-white p-5">
            <header className="mb-3 flex flex-wrap items-center gap-3">
              <h3 className="text-base font-semibold">{session.measuredAt}</h3>
              <div className="flex flex-wrap gap-2 text-sm text-slate-700">
                {session.weightKg !== null && (
                  <span className="rounded bg-slate-100 px-2 py-0.5">{session.weightKg} kg</span>
                )}
                {session.heightCm !== null && (
                  <span className="rounded bg-slate-100 px-2 py-0.5">{session.heightCm} cm</span>
                )}
                {session.waistCm !== null && (
                  <span className="rounded bg-slate-100 px-2 py-0.5">
                    {t('measurements.waist')}: {session.waistCm}
                  </span>
                )}
                {session.hipCm !== null && (
                  <span className="rounded bg-slate-100 px-2 py-0.5">
                    {t('measurements.hip')}: {session.hipCm}
                  </span>
                )}
              </div>
            </header>
            {session.calculated.length > 0 && (
              <div>
                <h4 className="mb-1 text-xs font-medium uppercase text-slate-500">
                  {t('measurements.calculated')}
                </h4>
                <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {session.calculated.map((calc) => (
                    <li key={`${session.id}-${calc.formulaId}`}>
                      <span className="font-medium text-slate-800">
                        {calc.roundedResult} {calc.unit}
                      </span>{' '}
                      <span
                        className="text-xs text-slate-400"
                        title={t('measurements.formulaProvenance', {
                          name: calc.formulaName,
                          version: calc.formulaVersion,
                        })}
                      >
                        {t('measurements.formulaProvenance', {
                          name: calc.formulaName,
                          version: calc.formulaVersion,
                        })}
                      </span>
                      {calc.warnings.includes('population_out_of_range') && (
                        <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                          {t('measurements.warningPopulation')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {session.notes && <p className="mt-2 text-sm text-slate-600">{session.notes}</p>}
          </article>
        ))}
      </div>
    </div>
  );
}
