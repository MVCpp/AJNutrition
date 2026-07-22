import type { PatientDto } from '@ajnutrition/shared';

export function PatientTable({ patients }: { patients: PatientDto[] }) {
  if (patients.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        Aún no hay pacientes registrados. Use «Nuevo paciente» para crear el primero.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Lista de pacientes</caption>
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-3">Expediente</th>
            <th scope="col" className="px-4 py-3">Nombre</th>
            <th scope="col" className="px-4 py-3">Fecha de nacimiento</th>
            <th scope="col" className="px-4 py-3">Contacto</th>
            <th scope="col" className="px-4 py-3">Estado</th>
          </tr>
        </thead>
        <tbody>
          {patients.map((patient) => (
            <tr key={patient.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3 font-mono text-xs">{patient.fileNumber}</td>
              <td className="px-4 py-3 font-medium">
                {patient.lastName}, {patient.firstName}
              </td>
              <td className="px-4 py-3">{patient.dateOfBirth}</td>
              <td className="px-4 py-3 text-slate-500">{patient.email ?? patient.phone ?? '—'}</td>
              <td className="px-4 py-3">
                <span
                  className={
                    patient.status === 'active'
                      ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800'
                      : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600'
                  }
                >
                  {patient.status === 'active' ? 'Activo' : 'Archivado'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
