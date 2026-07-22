import { useTranslation } from 'react-i18next';
import type { PatientDto } from '@ajnutrition/shared';

export function PatientTable({
  patients,
  onSelect,
}: {
  patients: PatientDto[];
  onSelect: (patient: PatientDto) => void;
}) {
  const { t } = useTranslation();

  if (patients.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        {t('patients.empty')}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{t('patients.tableCaption')}</caption>
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-3">
              {t('patients.colFile')}
            </th>
            <th scope="col" className="px-4 py-3">
              {t('patients.colName')}
            </th>
            <th scope="col" className="px-4 py-3">
              {t('patients.colDob')}
            </th>
            <th scope="col" className="px-4 py-3">
              {t('patients.colContact')}
            </th>
            <th scope="col" className="px-4 py-3">
              {t('patients.colStatus')}
            </th>
          </tr>
        </thead>
        <tbody>
          {patients.map((patient) => {
            const fullName = `${patient.firstName} ${patient.lastName}`;
            return (
              <tr key={patient.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{patient.fileNumber}</td>
                <td className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => onSelect(patient)}
                    aria-label={t('patients.openConsultations', { name: fullName })}
                    className="text-left text-emerald-800 underline-offset-2 hover:underline focus:outline-2 focus:outline-offset-2 focus:outline-emerald-700"
                  >
                    {patient.lastName}, {patient.firstName}
                  </button>
                </td>
                <td className="px-4 py-3">{patient.dateOfBirth}</td>
                <td className="px-4 py-3 text-slate-500">
                  {patient.email ?? patient.phone ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      patient.status === 'active'
                        ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800'
                        : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600'
                    }
                  >
                    {patient.status === 'active'
                      ? t('patients.statusActive')
                      : t('patients.statusArchived')}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
