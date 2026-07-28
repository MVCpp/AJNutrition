import type { AppointmentDto } from '@ajnutrition/shared';

/**
 * Desktop reminder for an appointment that is about to start (Epic 6).
 *
 * PRIVACY: an OS notification is shown outside the application — it can appear
 * over a locked screen, be mirrored to a phone, and is written to the system's
 * notification history, none of which the app controls. So the text carries a
 * TIME and nothing else: never the patient's name, file number or the reason
 * for the visit. The practitioner opens the app to see who it is.
 *
 * Reminders only fire while the app is unlocked, because the agenda lives in
 * the encrypted database. That is a deliberate limit, not an oversight: waking
 * a locked machine to announce clinical activity is not something this app
 * should do.
 *
 * This module deliberately imports NOTHING from electron: the scheduling rule
 * is the part worth testing, and the test suite runs under plain Node in CI.
 * The caller injects how a notification is actually shown.
 */

export interface DueReminder {
  appointmentId: string;
  /** Local HH:MM of the appointment, the only detail the notification shows. */
  time: string;
  minutesAway: number;
}

function localTime(scheduledAt: string): string {
  const date = new Date(scheduledAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Appointments starting within `windowMinutes` that have not been announced
 * yet. Pure — the scheduling rule is the part worth testing.
 */
export function dueReminders(
  appointments: readonly AppointmentDto[],
  now: Date,
  windowMinutes: number,
  alreadyNotified: ReadonlySet<string>,
): DueReminder[] {
  const due: DueReminder[] = [];
  for (const appointment of appointments) {
    // Only appointments still expected to happen: a cancelled, completed or
    // no-show cita must never nag.
    if (appointment.status !== 'scheduled') continue;
    if (alreadyNotified.has(appointment.id)) continue;
    const startsAt = new Date(appointment.scheduledAt);
    if (Number.isNaN(startsAt.getTime())) continue;
    const minutesAway = (startsAt.getTime() - now.getTime()) / 60_000;
    // Already started (or long past) is not a reminder; the agenda shows it.
    if (minutesAway < 0 || minutesAway > windowMinutes) continue;
    due.push({
      appointmentId: appointment.id,
      time: localTime(appointment.scheduledAt),
      minutesAway: Math.round(minutesAway),
    });
  }
  return due;
}

export interface ReminderDeps {
  now: () => Date;
  /** Throws while locked — the agenda is inside the encrypted database. */
  readSettings: () => { remindersEnabled: boolean; reminderMinutes: number };
  listToday: (isoDate: string) => AppointmentDto[];
  notify: (title: string, body: string) => void;
  logger?: { info(area: string, event: string, data?: unknown): void };
}

export class AppointmentReminders {
  private readonly notified = new Set<string>();

  constructor(private readonly deps: ReminderDeps) {}

  /** Never throws: a failed reminder must not disturb the session. */
  tick(): DueReminder[] {
    try {
      const settings = this.deps.readSettings();
      if (!settings.remindersEnabled) return [];
      const now = this.deps.now();
      const pad = (n: number) => String(n).padStart(2, '0');
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const due = dueReminders(
        this.deps.listToday(today),
        now,
        settings.reminderMinutes,
        this.notified,
      );
      for (const reminder of due) {
        this.notified.add(reminder.appointmentId);
        this.deps.notify(
          'NutriPlan',
          reminder.minutesAway <= 0
            ? `Cita a las ${reminder.time}`
            : `Cita a las ${reminder.time} (en ${reminder.minutesAway} min)`,
        );
      }
      if (due.length > 0) this.deps.logger?.info('agenda', 'reminder', { count: due.length });
      return due;
    } catch {
      // Locked, or the agenda could not be read: nothing to announce.
      return [];
    }
  }

  /** Locking ends the session; a new one may legitimately re-announce. */
  reset(): void {
    this.notified.clear();
  }
}
