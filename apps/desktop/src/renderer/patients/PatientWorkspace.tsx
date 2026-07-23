import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PatientDto } from '@ajnutrition/shared';
import { ConsultationsPanel } from '../consultations/ConsultationsPanel';
import { ClinicalHistoryPanel } from '../history/ClinicalHistoryPanel';
import { ConsentsPanel } from '../consents/ConsentsPanel';

type WorkspaceTab = 'consultations' | 'history' | 'consents';

/** Patient expediente: tabbed workspace (§18 of the brief, growing per phase). */
export function PatientWorkspace({ patient, onBack }: { patient: PatientDto; onBack: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<WorkspaceTab>('consultations');

  const tabs: Array<{ id: WorkspaceTab; label: string }> = [
    { id: 'consultations', label: t('workspace.tabConsultations') },
    { id: 'history', label: t('workspace.tabHistory') },
    { id: 'consents', label: t('workspace.tabConsents') },
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

      <div className="mb-2 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">
          {patient.lastName}, {patient.firstName}
        </h2>
        <span className="font-mono text-xs text-slate-400">#{patient.fileNumber}</span>
        <span className="text-sm text-slate-500">{patient.dateOfBirth}</span>
      </div>

      <div
        role="tablist"
        aria-label={t('workspace.tabConsultations')}
        className="mb-6 flex gap-1 border-b border-slate-200"
      >
        {tabs.map((entry) => (
          <button
            key={entry.id}
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={
              tab === entry.id
                ? 'rounded-t-md border border-b-0 border-slate-200 bg-white px-4 py-2 text-sm font-medium text-emerald-800'
                : 'px-4 py-2 text-sm text-slate-500 hover:text-slate-800'
            }
          >
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
