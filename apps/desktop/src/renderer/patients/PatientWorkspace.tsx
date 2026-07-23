import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PatientDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';
import { ConsultationsPanel } from '../consultations/ConsultationsPanel';
import { ClinicalHistoryPanel } from '../history/ClinicalHistoryPanel';
import { ConsentsPanel } from '../consents/ConsentsPanel';
import { PhotosPanel } from '../photos/PhotosPanel';
import { MeasurementsPanel } from '../measurements/MeasurementsPanel';
import { PlansPanel } from '../plans/PlansPanel';

type WorkspaceTab = 'consultations' | 'measurements' | 'plans' | 'history' | 'consents' | 'photos';

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

  const tabs: Array<{ id: WorkspaceTab; label: string }> = [
    { id: 'consultations', label: t('workspace.tabConsultations') },
    { id: 'measurements', label: t('workspace.tabMeasurements') },
    { id: 'plans', label: t('workspace.tabPlans') },
    { id: 'history', label: t('workspace.tabHistory') },
    { id: 'consents', label: t('workspace.tabConsents') },
    { id: 'photos', label: t('workspace.tabPhotos') },
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

      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold">
            {patient.lastName}, {patient.firstName}
          </h2>
          <span className="font-mono text-xs text-slate-400">#{patient.fileNumber}</span>
          <span className="text-sm text-slate-500">{patient.dateOfBirth}</span>
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
      {tab === 'measurements' && <MeasurementsPanel patient={patient} />}
      {tab === 'plans' && <PlansPanel patient={patient} />}
      {tab === 'history' && <ClinicalHistoryPanel patient={patient} />}
      {tab === 'consents' && <ConsentsPanel patient={patient} />}
      {tab === 'photos' && <PhotosPanel patient={patient} />}
    </section>
  );
}
