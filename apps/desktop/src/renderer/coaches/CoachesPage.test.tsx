// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CoachDetailDto, CoachDto, CoachPackResultDto } from '@ajnutrition/shared';
import { ok, renderWithProviders } from '../test/harness';
import { CoachesPage } from './CoachesPage';

const coach: CoachDto = {
  id: '00000000-0000-4000-8000-0000000000bb',
  displayName: 'Carlos Ruiz',
  organization: 'Gimnasio Norte',
  email: null,
  phone: null,
  notes: null,
  status: 'active',
  activeTraineeCount: 2,
  createdAt: '2026-08-05T12:00:00.000Z',
  updatedAt: '2026-08-05T12:00:00.000Z',
};

const detail: CoachDetailDto = {
  coach,
  trainees: [
    {
      linkId: '00000000-0000-4000-8000-0000000000c1',
      linkedAt: '2026-08-01T10:00:00.000Z',
      patient: {
        id: '00000000-0000-4000-8000-0000000000a1',
        fileNumber: 7,
        firstName: 'Elena',
        lastName: 'Márquez',
        dateOfBirth: '1990-05-14',
        sexAtBirth: 'female',
        email: null,
        phone: null,
        status: 'active',
        createdAt: '2026-08-05T12:00:00.000Z',
        updatedAt: '2026-08-05T12:00:00.000Z',
      },
    },
  ],
};

const CANCELED: CoachPackResultDto = {
  canceled: true,
  folderName: null,
  written: [],
  skipped: [],
};

function setup(pack: CoachPackResultDto = CANCELED) {
  const exportPack = vi.fn(() => ok(pack));
  renderWithProviders(<CoachesPage />, {
    coach: {
      list: () => ok([coach]),
      get: () => ok(detail),
      exportPack,
      setStatus: () => ok(coach),
    } as never,
  });
  return { exportPack };
}

/** List → coach → the pack button lives on the detail view. */
async function openCoach(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Carlos Ruiz' }));
  return screen.findByRole('button', { name: 'Generar reportes de todos sus pacientes' });
}

describe('CoachesPage', () => {
  it('lists trainers with their trainee count', async () => {
    setup();
    expect(await screen.findByRole('button', { name: 'Carlos Ruiz' })).toBeTruthy();
    expect(screen.getByText('Gimnasio Norte')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('shows a trainer their trainees as identity only — never a measurement', async () => {
    // The whole premise of C-1: a referral is administrative. Progress belongs
    // to the patient and reaches the trainer only through a consent-backed
    // authorisation, never through this screen.
    const user = userEvent.setup();
    setup();
    await openCoach(user);

    expect(screen.getByText('Elena Márquez')).toBeTruthy();
    expect(screen.getByText('Exp. 7')).toBeTruthy();
    expect(screen.getByText(/Pacientes vinculados \(1\)/)).toBeTruthy();
  });

  it('names every trainee left out of a pack, and why', async () => {
    // The safety property this screen exists to keep. A batch that quietly
    // omitted someone reads as "everyone was included", and she would either
    // send the trainer less than she believes or believe a patient consented.
    const user = userEvent.setup();
    setup({
      canceled: false,
      folderName: 'Reportes',
      written: ['Entrenador_7_2026-08-06.pdf'],
      skipped: [
        { patientName: 'Bruno Salas', reason: 'no_authorisation' },
        { patientName: 'Rosa Díaz', reason: 'consent_not_accepted' },
        { patientName: 'Ana Torres', reason: 'patient_archived' },
      ],
    });

    await user.click(await openCoach(user));

    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('Se generaron 1 reportes');

    // Each skipped trainee is named, with a reason in Spanish.
    expect(within(status).getByText(/Bruno Salas/).textContent).toContain('sin autorización');
    expect(within(status).getByText(/Rosa Díaz/).textContent).toContain('retiró el consentimiento');
    // patient_archived is NOT an authorisation failure, and says so: the grant
    // may be live, and she can still produce that one report by hand.
    expect(within(status).getByText(/Ana Torres/).textContent).toContain('Paciente archivado');

    // Every reason resolved to real text. A missing i18n key would leave the
    // raw lookup on screen, which is how a silent omission comes back in
    // another form — a line she cannot read is a line she will skip past.
    expect(status.textContent).not.toContain('sharing.reason.');
  });

  it('claims nothing when she cancels the folder picker', async () => {
    // The mutation still resolves; if the component treated that as success it
    // would report reports that were never written anywhere.
    const user = userEvent.setup();
    const { exportPack } = setup(CANCELED);

    await user.click(await openCoach(user));

    await waitFor(() => expect(exportPack).toHaveBeenCalledWith({ coachId: coach.id }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/Se generaron/)).toBeNull();
  });
});
