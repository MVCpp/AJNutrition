import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConsultationType } from '@ajnutrition/shared';
import { unwrap } from '../api';
import { mutationErrorMessage, useConsultationMutation } from './ConsultationsPanel';

const SECTIONS = ['subjective', 'objective', 'assessment', 'plan'] as const;

export function ConsultationForm({
  patientId,
  onCreated,
}: {
  patientId: string;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const [consultationDate, setConsultationDate] = useState(today);
  const [consultationType, setConsultationType] = useState<ConsultationType>('follow_up');
  const [sections, setSections] = useState<Record<(typeof SECTIONS)[number], string>>({
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
  });

  const createMutation = useConsultationMutation(
    patientId,
    (command: Parameters<typeof window.ajnutrition.consultation.create>[0]) =>
      unwrap(window.ajnutrition.consultation.create(command)),
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(
      {
        patientId,
        consultationDate,
        consultationType,
        subjective: sections.subjective || undefined,
        objective: sections.objective || undefined,
        assessment: sections.assessment || undefined,
        plan: sections.plan || undefined,
      },
      { onSuccess: onCreated },
    );
  };

  const errorMessage = mutationErrorMessage(createMutation.error);

  return (
    <form onSubmit={submit} noValidate>
      {errorMessage && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {errorMessage}
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="consultation-date" className="mb-1 block text-sm font-medium">
            {t('consultations.date')}
          </label>
          <input
            id="consultation-date"
            type="date"
            value={consultationDate}
            max={today}
            onChange={(e) => setConsultationDate(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="consultation-type" className="mb-1 block text-sm font-medium">
            {t('consultations.type')}
          </label>
          <select
            id="consultation-type"
            value={consultationType}
            onChange={(e) => setConsultationType(e.target.value as ConsultationType)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="initial">{t('consultations.typeInitial')}</option>
            <option value="follow_up">{t('consultations.typeFollowUp')}</option>
            <option value="other">{t('consultations.typeOther')}</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <div key={section}>
            <label htmlFor={`section-${section}`} className="mb-1 block text-sm font-medium">
              {t(`consultations.${section}`)}
            </label>
            <textarea
              id={`section-${section}`}
              rows={4}
              value={sections[section]}
              onChange={(e) => setSections((prev) => ({ ...prev, [section]: e.target.value }))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>

      <div className="mt-6">
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {createMutation.isPending ? t('consultations.saving') : t('consultations.save')}
        </button>
      </div>
    </form>
  );
}
