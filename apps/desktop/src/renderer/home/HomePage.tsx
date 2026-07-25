import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AppointmentDto } from '@ajnutrition/shared';
import { unwrap } from '../api';

function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const longDate = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const STATUS_STYLE: Record<AppointmentDto['status'], string> = {
  scheduled: 'bg-sky-100 text-sky-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-slate-100 text-slate-500',
  no_show: 'bg-amber-100 text-amber-800',
};

/** Landing view: today at a glance, built entirely from existing queries. */
export function HomePage({
  onNavigate,
}: {
  onNavigate: (section: 'agenda' | 'patients' | 'foods') => void;
}) {
  const { t } = useTranslation();
  const now = new Date();
  const today = isoDate(now);
  const weekEnd = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6));

  const patientsQuery = useQuery({
    queryKey: ['patients', ''],
    queryFn: () => unwrap(window.ajnutrition.patient.list({})),
  });
  const weekQuery = useQuery({
    queryKey: ['agenda', today, weekEnd],
    queryFn: () =>
      unwrap(window.ajnutrition.appointment.agenda({ fromDate: today, toDate: weekEnd })),
  });

  const todayAppointments = (weekQuery.data ?? []).filter((a) => a.scheduledAt.startsWith(today));
  const upcoming = (weekQuery.data ?? []).filter(
    (a) => !a.scheduledAt.startsWith(today) && a.status === 'scheduled',
  );

  const tiles = [
    {
      key: 'patients',
      label: t('home.tilePatients'),
      value: patientsQuery.data?.length ?? '—',
      onClick: () => onNavigate('patients'),
    },
    {
      key: 'today',
      label: t('home.tileToday'),
      value: todayAppointments.filter((a) => a.status === 'scheduled').length,
      onClick: () => onNavigate('agenda'),
    },
    {
      key: 'week',
      label: t('home.tileWeek'),
      value: (weekQuery.data ?? []).filter((a) => a.status === 'scheduled').length,
      onClick: () => onNavigate('agenda'),
    },
  ];

  return (
    <section aria-labelledby="home-heading">
      <div className="mb-6">
        <h2 id="home-heading" className="text-lg font-semibold">
          {t('home.greeting')}
        </h2>
        <p className="text-sm capitalize text-slate-500">{longDate.format(now)}</p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            onClick={tile.onClick}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50/40"
          >
            <p className="text-sm text-slate-500">{tile.label}</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{tile.value}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-800">📅 {t('home.todayHeading')}</h3>
            <button
              type="button"
              onClick={() => onNavigate('agenda')}
              className="text-xs text-emerald-800 underline-offset-2 hover:underline"
            >
              {t('home.openAgenda')}
            </button>
          </div>
          {todayAppointments.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-400">{t('home.noAppointmentsToday')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {todayAppointments.map((appointment) => (
                <li
                  key={appointment.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="font-semibold tabular-nums text-slate-800">
                    {appointment.scheduledAt.slice(11)}
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
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-800">🗓 {t('home.upcomingHeading')}</h3>
          </div>
          {upcoming.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-400">{t('home.noUpcoming')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.slice(0, 8).map((appointment) => (
                <li
                  key={appointment.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="tabular-nums text-slate-600">
                    {appointment.scheduledAt.slice(0, 10)}
                  </span>
                  <span className="font-semibold tabular-nums text-slate-800">
                    {appointment.scheduledAt.slice(11)}
                  </span>
                  <span className="font-medium text-slate-800">{appointment.patientName}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
