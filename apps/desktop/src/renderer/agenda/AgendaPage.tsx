import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AppointmentDto, PatientDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';
import { Modal } from '../components/Modal';

const STATUS_STYLE: Record<AppointmentDto['status'], string> = {
  scheduled: 'bg-sky-100 text-sky-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-slate-100 text-slate-500',
  no_show: 'bg-amber-100 text-amber-800',
};

/** Local civil date as YYYY-MM-DD (never UTC — the agenda is wall-clock). */
function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function mondayOf(date: Date): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

const dayFormat = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export function AgendaPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    patientId: '',
    date: isoDate(new Date()),
    time: '10:00',
    durationMinutes: '30',
    reason: '',
  });

  const weekStart = mondayOf(addDays(new Date(), weekOffset * 7));
  const fromDate = isoDate(weekStart);
  const toDate = isoDate(addDays(weekStart, 6));

  const agendaQuery = useQuery({
    queryKey: ['agenda', fromDate, toDate],
    queryFn: () => unwrap(window.ajnutrition.appointment.agenda({ fromDate, toDate })),
  });
  const patientsQuery = useQuery({
    queryKey: ['patients', ''],
    queryFn: () => unwrap(window.ajnutrition.patient.list({})),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['agenda'] });

  const createMutation = useMutation({
    mutationFn: () =>
      unwrap(
        window.ajnutrition.appointment.create({
          patientId: form.patientId,
          scheduledAt: `${form.date}T${form.time}`,
          durationMinutes: Number(form.durationMinutes),
          reason: form.reason.trim() || undefined,
        }),
      ),
    onSuccess: async () => {
      await invalidate();
      setShowForm(false);
      setForm({ ...form, reason: '' });
      createMutation.reset();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (input: { appointmentId: string; status: 'completed' | 'cancelled' | 'no_show' }) =>
      unwrap(window.ajnutrition.appointment.resolve(input)),
    onSuccess: invalidate,
  });

  // One-click visit flow: draft consultation pre-dated with the cita's date
  // (and its motivo as the opening note), linked, and the cita completed.
  // The draft is then finished from the patient's expediente.
  const consultMutation = useMutation({
    mutationFn: async (appointment: AppointmentDto) => {
      const consultation = await unwrap(
        window.ajnutrition.consultation.create({
          patientId: appointment.patientId,
          consultationDate: appointment.scheduledAt.slice(0, 10),
          consultationType: 'follow_up',
          subjective: appointment.reason ?? t('agenda.defaultSubjective'),
        }),
      );
      return unwrap(
        window.ajnutrition.appointment.resolve({
          appointmentId: appointment.id,
          status: 'completed',
          consultationId: consultation.id,
        }),
      );
    },
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ['consultations'] });
    },
  });

  const errorOf = (error: unknown) =>
    error instanceof ApiError ? `${error.message} (${error.detail.supportCode})` : null;
  const errorMessage =
    errorOf(createMutation.error) ??
    errorOf(resolveMutation.error) ??
    errorOf(consultMutation.error);

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const key = isoDate(date);
    return {
      key,
      date,
      appointments: (agendaQuery.data ?? []).filter((a) => a.scheduledAt.startsWith(key)),
    };
  });
  const todayKey = isoDate(new Date());

  return (
    <section aria-labelledby="agenda-heading">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="agenda-heading" className="text-lg font-semibold">
            {t('agenda.heading')}
          </h2>
          <p className="text-sm text-slate-500">{t('agenda.intro')}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {t('agenda.new')}
        </button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {errorMessage}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2">
        <button
          type="button"
          onClick={() => setWeekOffset((v) => v - 1)}
          className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          ← {t('agenda.prevWeek')}
        </button>
        <div className="flex items-center gap-3">
          <p className="text-sm font-medium text-slate-700 tabular-nums">
            {fromDate} — {toDate}
          </p>
          {weekOffset !== 0 && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs text-emerald-800 hover:bg-emerald-200"
            >
              {t('agenda.today')}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setWeekOffset((v) => v + 1)}
          className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          {t('agenda.nextWeek')} →
        </button>
      </div>

      {agendaQuery.isLoading && <p className="text-sm text-slate-500">{t('agenda.loading')}</p>}

      <div className="space-y-3">
        {days.map(({ key, date, appointments }) => (
          <div
            key={key}
            className={`rounded-xl border bg-white ${
              key === todayKey ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
              <h3 className="text-sm font-semibold capitalize text-slate-800">
                {dayFormat.format(date)}
              </h3>
              {key === todayKey && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                  {t('agenda.todayTag')}
                </span>
              )}
            </div>
            {appointments.length === 0 ? (
              <p className="px-4 py-2.5 text-xs text-slate-400">{t('agenda.emptyDay')}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {appointments.map((appointment) => (
                  <li
                    key={appointment.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm"
                  >
                    <span className="font-semibold tabular-nums text-slate-800">
                      {appointment.scheduledAt.slice(11)}
                    </span>
                    <span className="text-xs text-slate-500 tabular-nums">
                      {appointment.durationMinutes} min
                    </span>
                    <span className="font-medium text-slate-800">{appointment.patientName}</span>
                    {appointment.reason && (
                      <span className="text-xs text-slate-500">{appointment.reason}</span>
                    )}
                    <span
                      className={`ml-auto rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[appointment.status]}`}
                    >
                      {t(`agenda.status_${appointment.status}`)}
                    </span>
                    {appointment.status === 'scheduled' && (
                      <span className="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          disabled={consultMutation.isPending}
                          onClick={() => consultMutation.mutate(appointment)}
                          title={t('agenda.registerConsultationTitle')}
                          className="rounded-md bg-emerald-700 px-2.5 py-1 font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                        >
                          {t('agenda.registerConsultation')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            resolveMutation.mutate({
                              appointmentId: appointment.id,
                              status: 'completed',
                            })
                          }
                          className="text-emerald-800 underline-offset-2 hover:underline"
                        >
                          {t('agenda.markCompleted')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            resolveMutation.mutate({
                              appointmentId: appointment.id,
                              status: 'no_show',
                            })
                          }
                          className="text-amber-700 underline-offset-2 hover:underline"
                        >
                          {t('agenda.markNoShow')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            resolveMutation.mutate({
                              appointmentId: appointment.id,
                              status: 'cancelled',
                            })
                          }
                          className="text-slate-500 underline-offset-2 hover:underline"
                        >
                          {t('agenda.markCancelled')}
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {showForm && (
        <Modal
          icon="📅"
          title={t('agenda.new')}
          subtitle={t('agenda.formHint')}
          onClose={() => setShowForm(false)}
          footer={
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-md px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100"
              >
                {t('agenda.cancel')}
              </button>
              <button
                type="submit"
                form="agenda-form"
                disabled={createMutation.isPending || form.patientId === ''}
                className="rounded-md bg-emerald-700 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
              >
                {createMutation.isPending ? t('agenda.saving') : t('agenda.save')}
              </button>
            </div>
          }
        >
          <form
            id="agenda-form"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
            noValidate
          >
            <div className="mb-4">
              <label htmlFor="ag-patient" className="mb-1 block text-sm font-medium">
                {t('agenda.patient')}
              </label>
              <select
                id="ag-patient"
                value={form.patientId}
                onChange={(e) => setForm({ ...form, patientId: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {(patientsQuery.data ?? []).map((patient: PatientDto) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.lastName}, {patient.firstName} (#{patient.fileNumber})
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="ag-date" className="mb-1 block text-sm font-medium">
                  {t('agenda.date')}
                </label>
                <input
                  id="ag-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="ag-time" className="mb-1 block text-sm font-medium">
                  {t('agenda.time')}
                </label>
                <input
                  id="ag-time"
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="ag-duration" className="mb-1 block text-sm font-medium">
                  {t('agenda.duration')}
                </label>
                <select
                  id="ag-duration"
                  value={form.durationMinutes}
                  onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {['15', '30', '45', '60', '90'].map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} min
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="ag-reason" className="mb-1 block text-sm font-medium">
                {t('agenda.reason')}
              </label>
              <input
                id="ag-reason"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder={t('agenda.reasonPlaceholder')}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
