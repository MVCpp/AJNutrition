import { PatientsPage } from './patients/PatientsPage';

/**
 * Application shell. Routing (TanStack Router) arrives with the second
 * screen — a router for a single page would be speculative structure.
 * UI copy is Spanish-first; extraction to i18next is scheduled in the
 * backlog before any second-language work.
 */
export function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-8 py-4">
        <h1 className="text-xl font-semibold text-slate-800">AJNutrition</h1>
        <p className="text-sm text-slate-500">Gestión de consulta nutricional</p>
      </header>
      <main className="mx-auto max-w-5xl px-8 py-8">
        <PatientsPage />
      </main>
    </div>
  );
}
