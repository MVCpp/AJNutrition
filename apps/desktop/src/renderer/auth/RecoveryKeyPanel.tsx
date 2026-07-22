import { useState } from 'react';

/**
 * One-time recovery key display. The key exists only in this component's
 * memory; the app never stores it. The user must actively confirm they
 * saved it before continuing.
 */
export function RecoveryKeyPanel({
  recoveryKey,
  onConfirmed,
}: {
  recoveryKey: string;
  onConfirmed: () => void;
}) {
  const [saved, setSaved] = useState(false);

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-6">
      <h3 className="mb-2 text-base font-semibold text-amber-900">
        Guarde su clave de recuperación
      </h3>
      <p className="mb-4 text-sm text-amber-800">
        Esta clave se muestra <strong>una sola vez</strong>. Si olvida su frase de acceso, es la
        única forma de recuperar sus datos. Escríbala y guárdela en un lugar seguro, separado de
        esta computadora.
      </p>
      <p className="mb-4 select-all break-all rounded-md border border-amber-200 bg-white p-4 text-center font-mono text-sm tracking-wide">
        {recoveryKey}
      </p>
      <p className="mb-4 text-sm font-medium text-red-800">
        Si pierde la frase de acceso y esta clave, sus datos serán irrecuperables. Nadie — ni el
        soporte técnico — podrá descifrarlos.
      </p>
      <label className="mb-4 flex items-start gap-2 text-sm text-amber-900">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-0.5"
        />
        He guardado la clave de recuperación en un lugar seguro.
      </label>
      <button
        type="button"
        disabled={!saved}
        onClick={onConfirmed}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        Continuar
      </button>
    </div>
  );
}
