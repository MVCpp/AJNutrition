import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PatientDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';
import { ConsultationsPanel } from '../consultations/ConsultationsPanel';
import { ClinicalHistoryPanel } from '../history/ClinicalHistoryPanel';
import { ConsentsPanel } from '../consents/ConsentsPanel';

type WorkspaceTab = 'consultations' | 'history' | 'consents';

/** Patient expediente: tabbed workspace (§18 of the brief, growing per phase). */
export function PatientWorkspace({ patient, onBack }: { patient: PatientDto; onBack: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<WorkspaceTab>('consultations');
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const exportMutation = useMutation({
    mutationFn: () => unwrap(window.ajnutrition.patient.export({ patientId: patient.id })),
    onSuccess: (result) => {
      if (!result.canceled && result.fileName) {
        setExportMessage(
          `${t('workspace.exported', { fileName: result.fileName })} — ${t('workspace.exportWarning')}`,
        );
      }
    },
    onError: (err) => setExportMessage(err instanceof ApiError ? err.message : String(err)),
  });

  const tabs: Array<{ id: WorkspaceTab; label: string; icon: string }> = [
    { id: 'consultations', label: t('workspace.tabConsultations'), icon: '🩺' },
    { id: 'history', label: t('workspace.tabHistory'), icon: '📋' },
    { id: 'consents', label: t('workspace.tabConsents'), icon: '✅' },
  ];

  return (
    <section aria-label={`${patient.firstName} ${patient.lastName}`}>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm text-slate-500 underline hover:text-slate-700"
      >
        {t('workspace.back')}
      </button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-white p-4">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-emerald-400 text-lg font-semibold text-white shadow-sm"
          >
            {patient.firstName.charAt(0)}
            {patient.lastName.charAt(0)}
          </span>
          <div>
            <h2 className="text-lg font-semibold leading-tight text-slate-800">
              {patient.firstName} {patient.lastName}
            </h2>
            <p className="text-sm text-slate-500">
              <span className="font-mono text-xs text-emerald-700">
                {t('workspace.fileBadge', { n: patient.fileNumber })}
              </span>
              <span className="mx-2 text-slate-300">·</span>
              {patient.dateOfBirth}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setExportMessage(null);
            exportMutation.mutate();
          }}
          disabled={exportMutation.isPending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {exportMutation.isPending ? t('workspace.exporting') : t('workspace.export')}
        </button>
      </div>

      {exportMessage && (
        <p
          role="status"
          className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800"
        >
          {exportMessage}
        </p>
      )}

      <div
        role="tablist"
        aria-label={`${patient.firstName} ${patient.lastName}`}
        className="mb-6 flex flex-wrap gap-2"
      >
        {tabs.map((entry) => (
          <button
            key={entry.id}
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={
              tab === entry.id
                ? 'flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm'
                : 'flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition-colors hover:border-emerald-300 hover:text-emerald-900'
            }
          >
            <span aria-hidden="true">{entry.icon}</span>
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'consultations' && <ConsultationsPanel patient={patient} />}
      {tab === 'history' && <ClinicalHistoryPanel patient={patient} />}
      {tab === 'consents' && <ConsentsPanel patient={patient} />}
    </section>
  );
}
