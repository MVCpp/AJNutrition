import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { HistoryCategory, HistoryEntryDto, PatientDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';

const CATEGORIES: HistoryCategory[] = [
  'allergy',
  'intolerance',
  'pathological',
  'non_pathological',
  'family',
  'medication',
  'supplement',
  'surgery',
  'dietary_pattern',
  'physical_activity',
  'preference',
  'other',
];

interface FormState {
  category: HistoryCategory;
  content: string;
  /** Set when updating an existing entry (temporal supersede). */
  supersedesId: string | null;
}

export function ClinicalHistoryPanel({ patient }: { patient: PatientDto }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);

  const historyQuery = useQuery({
    queryKey: ['history', patient.id, showSuperseded],
    queryFn: () =>
      unwrap(
        window.ajnutrition.history.list({
          patientId: patient.id,
          includeSuperseded: showSuperseded,
        }),
      ),
  });

  const addMutation = useMutation({
    mutationFn: (state: FormState) =>
      unwrap(
        window.ajnutrition.history.add({
          patientId: patient.id,
          category: state.category,
          content: state.content,
          supersedesId: state.supersedesId ?? undefined,
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['history', patient.id] });
      setForm(null);
    },
  });

  const errorMessage =
    addMutation.error instanceof ApiError
      ? `${addMutation.error.message} (${addMutation.error.detail.supportCode})`
      : null;

  const grouped = new Map<HistoryCategory, HistoryEntryDto[]>();
  for (const entry of historyQuery.data ?? []) {
    const list = grouped.get(entry.category) ?? [];
    list.push(entry);
    grouped.set(entry.category, list);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setForm({ category: 'allergy', content: '', supersedesId: null })}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {t('history.add')}
        </button>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={showSuperseded}
            onChange={(e) => setShowSuperseded(e.target.checked)}
          />
          {showSuperseded ? t('history.hideHistory') : t('history.showHistory')}
        </label>
      </div>

      {form !== null && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addMutation.mutate(form);
          }}
          noValidate
          className="mb-6 rounded-lg border border-slate-200 bg-white p-6"
        >
          {errorMessage && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {errorMessage}
            </div>
          )}
          {form.supersedesId !== null && (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              {t('history.updating')}
            </p>
          )}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="history-category" className="mb-1 block text-sm font-medium">
                {t('history.category')}
              </label>
              <select
                id="history-category"
                value={form.category}
                disabled={form.supersedesId !== null}
                onChange={(e) => setForm({ ...form, category: e.target.value as HistoryCategory })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(`history.categories.${category}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label htmlFor="history-content" className="mb-1 block text-sm font-medium">
              {t('history.content')}
            </label>
            <textarea
              id="history-content"
              rows={3}
              value={form.content}
              autoFocus
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={addMutation.isPending || !form.content.trim()}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {addMutation.isPending ? t('history.saving') : t('history.save')}
            </button>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              {t('history.cancel')}
            </button>
          </div>
        </form>
      )}

      {historyQuery.isLoading && <p className="text-sm text-slate-500">{t('history.loading')}</p>}
      {historyQuery.isError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {t('history.loadError', { message: (historyQuery.error as Error).message })}
        </div>
      )}
      {historyQuery.data && historyQuery.data.length === 0 && form === null && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {t('history.empty')}
        </div>
      )}

      <div className="space-y-6">
        {CATEGORIES.filter((category) => grouped.has(category)).map((category) => (
          <section key={category} aria-label={t(`history.categories.${category}`)}>
            <h3 className="mb-2 text-xs font-medium uppercase text-slate-500">
              {t(`history.categories.${category}`)}
            </h3>
            <ul className="space-y-2">
              {grouped.get(category)?.map((entry) => (
                <li
                  key={entry.id}
                  className={
                    entry.supersededAt === null
                      ? 'rounded-md border border-slate-200 bg-white p-4'
                      : 'rounded-md border border-slate-100 bg-slate-50 p-4 opacity-70'
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="whitespace-pre-wrap text-sm text-slate-800">{entry.content}</p>
                    {entry.supersededAt === null && (
                      <button
                        type="button"
                        onClick={() =>
                          setForm({
                            category: entry.category,
                            content: entry.content,
                            supersedesId: entry.id,
                          })
                        }
                        className="shrink-0 rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                      >
                        {t('history.update')}
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    {entry.supersededAt === null
                      ? t('history.recordedOn', {
                          date: new Date(entry.createdAt).toLocaleDateString(),
                        })
                      : t('history.supersededOn', {
                          date: new Date(entry.supersededAt).toLocaleDateString(),
                        })}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
