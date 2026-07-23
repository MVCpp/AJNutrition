import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ConsentDto, ConsentMethod, ConsentType, PatientDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';

const CONSENT_TYPES: ConsentType[] = [
  'data_processing',
  'photo',
  'ai_processing',
  'communications',
  'third_party_transfer',
];

interface FormState {
  consentType: ConsentType;
  decision: 'accepted' | 'declined';
  noticeVersion: string;
  method: ConsentMethod;
  notes: string;
}

const statusChipClass: Record<string, string> = {
  accepted: 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800',
  declined: 'rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800',
  withdrawn: 'rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600',
  none: 'rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400',
};

export function ConsentsPanel({ patient }: { patient: PatientDto }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);

  const consentsQuery = useQuery({
    queryKey: ['consents', patient.id],
    queryFn: () => unwrap(window.ajnutrition.consent.list({ patientId: patient.id })),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['consents', patient.id] });

  const recordMutation = useMutation({
    mutationFn: (state: FormState) =>
      unwrap(
        window.ajnutrition.consent.record({
          patientId: patient.id,
          consentType: state.consentType,
          decision: state.decision,
          noticeVersion: state.noticeVersion,
          method: state.method,
          notes: state.notes.trim() ? state.notes : undefined,
        }),
      ),
    onSuccess: async () => {
      await invalidate();
      setForm(null);
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: (consentId: string) => unwrap(window.ajnutrition.consent.withdraw({ consentId })),
    onSuccess: invalidate,
  });

  const errorMessage =
    recordMutation.error instanceof ApiError
      ? `${recordMutation.error.message} (${recordMutation.error.detail.supportCode})`
      : withdrawMutation.error instanceof ApiError
        ? `${withdrawMutation.error.message} (${withdrawMutation.error.detail.supportCode})`
        : null;

  // Latest decision per type = current legal position for that purpose.
  const current = new Map<ConsentType, ConsentDto>();
  for (const record of consentsQuery.data ?? []) {
    const existing = current.get(record.consentType);
    if (!existing || record.decidedAt > existing.decidedAt) current.set(record.consentType, record);
  }

  return (
    <div>
      {errorMessage && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {errorMessage}
        </div>
      )}

      <section aria-label={t('consents.current')} className="mb-6">
        <h3 className="mb-2 text-xs font-medium uppercase text-slate-500">
          {t('consents.current')}
        </h3>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CONSENT_TYPES.map((type) => {
            const record = current.get(type);
            const status = record?.status ?? 'none';
            return (
              <li
                key={type}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-4 py-3"
              >
                <span className="text-sm text-slate-800">{t(`consents.types.${type}`)}</span>
                <span className="flex items-center gap-2">
                  <span className={statusChipClass[status]}>
                    {status === 'none' ? t('consents.none') : t(`consents.${status}`)}
                  </span>
                  {record?.status === 'accepted' && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(t('consents.withdrawConfirm'))) {
                          withdrawMutation.mutate(record.id);
                        }
                      }}
                      disabled={withdrawMutation.isPending}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {t('consents.withdraw')}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {form === null ? (
        <button
          type="button"
          onClick={() =>
            setForm({
              consentType: 'data_processing',
              decision: 'accepted',
              noticeVersion: '',
              method: 'written',
              notes: '',
            })
          }
          className="mb-6 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {t('consents.record')}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            recordMutation.mutate(form);
          }}
          noValidate
          className="mb-6 rounded-lg border border-slate-200 bg-white p-6"
        >
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="consent-type" className="mb-1 block text-sm font-medium">
                {t('consents.type')}
              </label>
              <select
                id="consent-type"
                value={form.consentType}
                onChange={(e) => setForm({ ...form, consentType: e.target.value as ConsentType })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {CONSENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`consents.types.${type}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="consent-decision" className="mb-1 block text-sm font-medium">
                {t('consents.decision')}
              </label>
              <select
                id="consent-decision"
                value={form.decision}
                onChange={(e) =>
                  setForm({ ...form, decision: e.target.value as 'accepted' | 'declined' })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="accepted">{t('consents.accepted')}</option>
                <option value="declined">{t('consents.declined')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="consent-notice" className="mb-1 block text-sm font-medium">
                {t('consents.noticeVersion')}
              </label>
              <input
                id="consent-notice"
                value={form.noticeVersion}
                onChange={(e) => setForm({ ...form, noticeVersion: e.target.value })}
                placeholder="p. ej. AVISO-2026-07"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="consent-method" className="mb-1 block text-sm font-medium">
                {t('consents.method')}
              </label>
              <select
                id="consent-method"
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value as ConsentMethod })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="written">{t('consents.methodWritten')}</option>
                <option value="verbal">{t('consents.methodVerbal')}</option>
                <option value="digital">{t('consents.methodDigital')}</option>
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label htmlFor="consent-notes" className="mb-1 block text-sm font-medium">
              {t('consents.notes')}
            </label>
            <textarea
              id="consent-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={recordMutation.isPending || !form.noticeVersion.trim()}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {recordMutation.isPending ? t('consents.saving') : t('consents.save')}
            </button>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              {t('consents.cancel')}
            </button>
          </div>
        </form>
      )}

      <section aria-label={t('consents.history')}>
        <h3 className="mb-2 text-xs font-medium uppercase text-slate-500">
          {t('consents.history')}
        </h3>
        {consentsQuery.isLoading && (
          <p className="text-sm text-slate-500">{t('consents.loading')}</p>
        )}
        {consentsQuery.isError && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {t('consents.loadError', { message: (consentsQuery.error as Error).message })}
          </div>
        )}
        {consentsQuery.data && consentsQuery.data.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            {t('consents.empty')}
          </div>
        )}
        <ul className="space-y-2">
          {[...(consentsQuery.data ?? [])].reverse().map((record) => (
            <li key={record.id} className="rounded-md border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-800">
                  {t(`consents.types.${record.consentType}`)}
                </span>
                <span className={statusChipClass[record.status]}>
                  {t(`consents.${record.status}`)}
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(record.decidedAt).toLocaleString()} · {record.noticeVersion} ·{' '}
                  {t(
                    record.method === 'written'
                      ? 'consents.methodWritten'
                      : record.method === 'verbal'
                        ? 'consents.methodVerbal'
                        : 'consents.methodDigital',
                  )}
                </span>
                {record.withdrawnAt && (
                  <span className="text-xs text-slate-400">
                    {t('consents.withdrawnOn', {
                      date: new Date(record.withdrawnAt).toLocaleString(),
                    })}
                  </span>
                )}
              </div>
              {record.notes && <p className="mt-2 text-sm text-slate-600">{record.notes}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
