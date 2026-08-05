import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { CoachDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';

interface FormState {
  displayName: string;
  organization: string;
  email: string;
  phone: string;
  notes: string;
}

function initialState(coach: CoachDto | undefined): FormState {
  return {
    displayName: coach?.displayName ?? '',
    organization: coach?.organization ?? '',
    email: coach?.email ?? '',
    phone: coach?.phone ?? '',
    notes: coach?.notes ?? '',
  };
}

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-2 focus:outline-emerald-700';

export function CoachForm({ coach, onSaved }: { coach?: CoachDto; onSaved: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialState(coach));

  const optional = (value: string) => (value.trim() ? value.trim() : undefined);

  const mutation = useMutation({
    mutationFn: () => {
      const details = {
        displayName: form.displayName.trim(),
        ...(optional(form.organization) ? { organization: form.organization.trim() } : {}),
        ...(optional(form.email) ? { email: form.email.trim() } : {}),
        ...(optional(form.phone) ? { phone: form.phone.trim() } : {}),
        ...(optional(form.notes) ? { notes: form.notes.trim() } : {}),
      };
      return coach
        ? unwrap(window.ajnutrition.coach.update({ coachId: coach.id, ...details }))
        : unwrap(window.ajnutrition.coach.create(details));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['coaches'] });
      onSaved();
    },
  });

  const error = mutation.error instanceof ApiError ? mutation.error : null;
  const fieldError = (field: string) => error?.detail.fieldErrors?.[field]?.[0];

  const set = (patch: Partial<FormState>) => setForm((previous) => ({ ...previous, ...patch }));

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <div>
        <label htmlFor="coach-name" className="mb-1 block text-sm font-medium text-slate-700">
          {t('coaches.name')}
        </label>
        <input
          id="coach-name"
          value={form.displayName}
          onChange={(event) => set({ displayName: event.target.value })}
          required
          className={inputClass}
        />
        {fieldError('displayName') && (
          <p className="mt-1 text-xs text-red-700">{t('coaches.nameError')}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="coach-org" className="mb-1 block text-sm font-medium text-slate-700">
            {t('coaches.organization')}
          </label>
          <input
            id="coach-org"
            value={form.organization}
            onChange={(event) => set({ organization: event.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="coach-phone" className="mb-1 block text-sm font-medium text-slate-700">
            {t('coaches.phone')}
          </label>
          <input
            id="coach-phone"
            value={form.phone}
            onChange={(event) => set({ phone: event.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="coach-email" className="mb-1 block text-sm font-medium text-slate-700">
          {t('coaches.email')}
        </label>
        <input
          id="coach-email"
          type="email"
          value={form.email}
          onChange={(event) => set({ email: event.target.value })}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="coach-notes" className="mb-1 block text-sm font-medium text-slate-700">
          {t('coaches.notes')}
        </label>
        <textarea
          id="coach-notes"
          value={form.notes}
          onChange={(event) => set({ notes: event.target.value })}
          rows={3}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-slate-500">{t('coaches.notesHint')}</p>
      </div>

      {error && !error.detail.fieldErrors && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error.message}
        </p>
      )}

      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {mutation.isPending ? t('coaches.saving') : t('coaches.save')}
      </button>
    </form>
  );
}
