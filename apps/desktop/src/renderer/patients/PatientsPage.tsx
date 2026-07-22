import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PatientDto } from '@ajnutrition/shared';
import { unwrap } from '../api';
import { PatientForm } from './PatientForm';
import { PatientTable } from './PatientTable';
import { ConsultationsPanel } from '../consultations/ConsultationsPanel';

export function PatientsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientDto | null>(null);

  const patientsQuery = useQuery({
    queryKey: ['patients', search],
    queryFn: () => unwrap(window.ajnutrition.patient.list(search ? { search } : {})),
    enabled: selectedPatient === null,
  });

  if (selectedPatient !== null) {
    return <ConsultationsPanel patient={selectedPatient} onBack={() => setSelectedPatient(null)} />;
  }

  return (
    <section aria-labelledby="patients-heading">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 id="patients-heading" className="text-lg font-semibold">
          {t('patients.heading')}
        </h2>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus:outline-2 focus:outline-offset-2 focus:outline-emerald-700"
        >
          {showForm ? t('patients.closeForm') : t('patients.newPatient')}
        </button>
      </div>

      {showForm && (
        <div className="mb-8 rounded-lg border border-slate-200 bg-white p-6">
          <PatientForm onCreated={() => setShowForm(false)} />
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="patient-search" className="mb-1 block text-sm font-medium text-slate-700">
          {t('patients.searchLabel')}
        </label>
        <input
          id="patient-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('patients.searchPlaceholder')}
          className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-2 focus:outline-emerald-700"
        />
      </div>

      {patientsQuery.isLoading && <p className="text-sm text-slate-500">{t('patients.loading')}</p>}
      {patientsQuery.isError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {t('patients.loadError', { message: (patientsQuery.error as Error).message })}
        </div>
      )}
      {patientsQuery.data && (
        <PatientTable patients={patientsQuery.data} onSelect={setSelectedPatient} />
      )}
    </section>
  );
}
