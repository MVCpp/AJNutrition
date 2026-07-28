import { describe, expect, it } from 'vitest';
import type { AppointmentDto } from '@ajnutrition/shared';
import { AppointmentReminders, dueReminders } from './appointment-reminders';

const NOW = new Date('2026-07-28T10:00:00');

function appointment(overrides: Partial<AppointmentDto> & { id: string }): AppointmentDto {
  return {
    patientId: '00000000-0000-4000-8000-0000000000aa',
    patientName: 'Carmen Iñárritu',
    scheduledAt: '2026-07-28T10:10',
    durationMinutes: 45,
    reason: 'Control de peso',
    status: 'scheduled',
    consultationId: null,
    createdAt: '2026-07-20T09:00:00.000Z',
    updatedAt: '2026-07-20T09:00:00.000Z',
    ...overrides,
  };
}

describe('dueReminders', () => {
  it('announces an appointment inside the window', () => {
    const due = dueReminders([appointment({ id: 'a' })], NOW, 15, new Set());
    expect(due).toEqual([{ appointmentId: 'a', time: '10:10', minutesAway: 10 }]);
  });

  it('ignores one that is further away than the window', () => {
    const far = appointment({ id: 'b', scheduledAt: '2026-07-28T14:00' });
    expect(dueReminders([far], NOW, 15, new Set())).toEqual([]);
  });

  it('ignores one that already started — the agenda shows it, a reminder is noise', () => {
    const started = appointment({ id: 'c', scheduledAt: '2026-07-28T09:30' });
    expect(dueReminders([started], NOW, 15, new Set())).toEqual([]);
  });

  it('never nags about a cita that will not happen', () => {
    const list = [
      appointment({ id: 'd', status: 'cancelled' }),
      appointment({ id: 'e', status: 'completed' }),
      appointment({ id: 'f', status: 'no_show' }),
    ];
    expect(dueReminders(list, NOW, 15, new Set())).toEqual([]);
  });

  it('announces each appointment once', () => {
    expect(dueReminders([appointment({ id: 'g' })], NOW, 15, new Set(['g']))).toEqual([]);
  });
});

describe('AppointmentReminders', () => {
  function harness(settings: { remindersEnabled: boolean; reminderMinutes: number }) {
    const shown: Array<{ title: string; body: string }> = [];
    const reminders = new AppointmentReminders({
      now: () => NOW,
      readSettings: () => settings,
      listToday: () => [appointment({ id: 'a' })],
      notify: (title, body) => shown.push({ title, body }),
    });
    return { reminders, shown };
  }

  it('shows a notification carrying the time and NOTHING else', () => {
    const { reminders, shown } = harness({ remindersEnabled: true, reminderMinutes: 15 });
    reminders.tick();

    expect(shown).toHaveLength(1);
    // An OS notification escapes the app: it can sit on a locked screen and in
    // the system's notification history. No patient identity may travel in it.
    const text = `${shown[0]?.title} ${shown[0]?.body}`;
    expect(text).toContain('10:10');
    expect(text).not.toContain('Carmen');
    expect(text).not.toContain('Iñárritu');
    expect(text).not.toContain('Control de peso');
  });

  it('does not repeat itself on the next tick, but a new session may', () => {
    const { reminders, shown } = harness({ remindersEnabled: true, reminderMinutes: 15 });
    reminders.tick();
    reminders.tick();
    expect(shown).toHaveLength(1);

    reminders.reset();
    reminders.tick();
    expect(shown).toHaveLength(2);
  });

  it('stays quiet when reminders are switched off', () => {
    const { reminders, shown } = harness({ remindersEnabled: false, reminderMinutes: 15 });
    expect(reminders.tick()).toEqual([]);
    expect(shown).toEqual([]);
  });

  it('stays quiet, and never throws, while the app is locked', () => {
    const reminders = new AppointmentReminders({
      now: () => NOW,
      readSettings: () => {
        throw new Error('locked');
      },
      listToday: () => [],
      notify: () => undefined,
    });
    expect(() => reminders.tick()).not.toThrow();
    expect(reminders.tick()).toEqual([]);
  });
});
