import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ConsultationType } from '@ajnutrition/shared';
import { unwrap } from '../api';
import { useUnsavedFlag } from '../ui/unsaved';
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

  // A new consultation is NOT autosaved: that would leave a draft behind for
  // every note the practitioner starts and abandons, and drafts cannot be
  // deleted. Flag it as unsaved instead, so locking warns.
  useUnsavedFlag(
    `consultation-new-${patientId}`,
    SECTIONS.some((key) => sections[key].trim() !== ''),
  );

  const queryClient = useQueryClient();
  const templatesQuery = useQuery({
    queryKey: ['note-templates'],
    queryFn: () => unwrap(window.ajnutrition.consultation.listTemplates()),
  });
  const saveTemplateMutation = useMutation({
    mutationFn: (name: string) =>
      unwrap(
        window.ajnutrition.consultation.saveTemplate({
          name,
          subjective: sections.subjective || undefined,
          objective: sections.objective || undefined,
          assessment: sections.assessment || undefined,
          plan: sections.plan || undefined,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['note-templates'] }),
  });

  const applyTemplate = (templateId: string) => {
    const template = (templatesQuery.data ?? []).find((entry) => entry.id === templateId);
    if (template === undefined) return;
    const hasText = SECTIONS.some((key) => sections[key].trim() !== '');
    // Inserting boilerplate over something already typed would silently
    // destroy it, so ask first.
    if (hasText && !window.confirm(t('consultations.templateReplaceConfirm'))) return;
    setSections({
      subjective: template.subjective ?? '',
      objective: template.objective ?? '',
      assessment: template.assessment ?? '',
      plan: template.plan ?? '',
    });
  };

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

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3">
        <label htmlFor="note-template" className="text-xs font-medium text-slate-600">
          {t('consultations.templates')}
        </label>
        <select
          id="note-template"
          value=""
          onChange={(e) => applyTemplate(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">{t('consultations.templatePick')}</option>
          {(templatesQuery.data ?? []).map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            const name = window.prompt(t('consultations.templateNamePrompt'));
            if (name !== null && name.trim() !== '') saveTemplateMutation.mutate(name.trim());
          }}
          disabled={
            saveTemplateMutation.isPending || SECTIONS.every((key) => sections[key].trim() === '')
          }
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {t('consultations.templateSave')}
        </button>
        {saveTemplateMutation.isSuccess && (
          <span className="text-xs text-emerald-700">{t('consultations.templateSaved')}</span>
        )}
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
