import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { unwrap } from '../api';
import { PatientForm } from './PatientForm';
import { PatientTable } from './PatientTable';

export function PatientsPage() {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  const patientsQuery = useQuery({
    queryKey: ['patients', search],
    queryFn: () => unwrap(window.ajnutrition.patient.list(search ? { search } : {})),
  });

  return (
    <section aria-labelledby="patients-heading">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 id="patients-heading" className="text-lg font-semibold">
          Pacientes
        </h2>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus:outline-2 focus:outline-offset-2 focus:outline-emerald-700"
        >
          {showForm ? 'Cerrar formulario' : 'Nuevo paciente'}
        </button>
      </div>

      {showForm && (
        <div className="mb-8 rounded-lg border border-slate-200 bg-white p-6">
          <PatientForm onCreated={() => setShowForm(false)} />
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="patient-search" className="mb-1 block text-sm font-medium text-slate-700">
          Buscar paciente
        </label>
        <input
          id="patient-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nombre o apellido"
          className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-2 focus:outline-emerald-700"
        />
      </div>

      {patientsQuery.isLoading && <p className="text-sm text-slate-500">Cargando pacientes…</p>}
      {patientsQuery.isError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          No fue posible cargar los pacientes: {(patientsQuery.error as Error).message}
        </div>
      )}
      {patientsQuery.data && <PatientTable patients={patientsQuery.data} />}
    </section>
  );
}
