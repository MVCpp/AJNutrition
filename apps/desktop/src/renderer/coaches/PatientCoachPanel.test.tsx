// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  CoachDto,
  LinkPatientToCoachCommand,
  PatientCoachLinkDto,
  PatientDto,
} from '@ajnutrition/shared';
import { ok, renderWithProviders, type OkResult } from '../test/harness';
import { PatientCoachPanel } from './PatientCoachPanel';

const patient: PatientDto = {
  id: '00000000-0000-4000-8000-0000000000aa',
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
};

const coach: CoachDto = {
  id: '00000000-0000-4000-8000-0000000000bb',
  displayName: 'Carlos Ruiz',
  organization: 'Gimnasio Norte',
  email: null,
  phone: null,
  notes: null,
  status: 'active',
  activeTraineeCount: 3,
  createdAt: '2026-08-05T12:00:00.000Z',
  updatedAt: '2026-08-05T12:00:00.000Z',
};

const activeLink: PatientCoachLinkDto = {
  id: '00000000-0000-4000-8000-0000000000cc',
  patientId: patient.id,
  coachId: coach.id,
  coachDisplayName: coach.displayName,
  coachStatus: 'active',
  linkedAt: '2026-08-01T10:00:00.000Z',
  revokedAt: null,
  revokedReason: null,
};

function setup(link: PatientCoachLinkDto | null) {
  const linkFn = vi.fn<(command: LinkPatientToCoachCommand) => OkResult<PatientCoachLinkDto>>(() =>
    ok(activeLink),
  );
  const unlink = vi.fn(() => ok({ ...activeLink, revokedAt: '2026-08-05T12:00:00.000Z' }));
  renderWithProviders(<PatientCoachPanel patient={patient} />, {
    coach: {
      forPatient: () => ok(link),
      list: () => ok([coach]),
      link: linkFn,
      unlink,
      // The sharing panel mounts under an active link; stub it so the test
      // exercises the real tree rather than a half-rendered one.
      sharing: () => ok({ grants: [], eligibleConsents: [] }),
    } as never,
  });
  return { linkFn, unlink };
}

describe('PatientCoachPanel', () => {
  it('says plainly that recording a trainer authorises nothing', async () => {
    // The whole privacy position of C-1 lives in this sentence. If it is ever
    // removed, someone will reasonably assume the link is permission to share.
    setup(null);
    expect(await screen.findByText(/No autoriza a enviarle nada/i)).toBeTruthy();
  });

  it('links the patient to the chosen trainer', async () => {
    const user = userEvent.setup();
    const { linkFn } = setup(null);

    await screen.findByLabelText(/Vincular con/);
    await user.selectOptions(screen.getByLabelText(/Vincular con/), coach.id);
    await user.click(screen.getByRole('button', { name: 'Vincular' }));

    await waitFor(() => expect(linkFn).toHaveBeenCalledTimes(1));
    expect(linkFn.mock.calls[0]?.[0]).toEqual({ patientId: patient.id, coachId: coach.id });
  });

  it('shows the current trainer instead of the picker once linked', async () => {
    setup(activeLink);
    expect(await screen.findByText('Carlos Ruiz')).toBeTruthy();
    expect(screen.queryByLabelText(/Vincular con/)).toBeNull();
  });

  it('asks before removing a link, and does nothing if refused', async () => {
    const user = userEvent.setup();
    const { unlink } = setup(activeLink);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await user.click(await screen.findByRole('button', { name: 'Retirar vinculación' }));
    expect(confirm).toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Retirar vinculación' }));
    await waitFor(() => expect(unlink).toHaveBeenCalledWith({ linkId: activeLink.id }));
    confirm.mockRestore();
  });

  it('never renders clinical data about the patient', async () => {
    const { container } = renderWithProviders(<PatientCoachPanel patient={patient} />, {
      coach: {
        forPatient: () => ok(activeLink),
        list: () => ok([coach]),
        sharing: () => ok({ grants: [], eligibleConsents: [] }),
      } as never,
    });
    await screen.findByText('Carlos Ruiz');
    const text = container.textContent ?? '';
    for (const forbidden of ['peso', 'kg', 'diagnós', 'plan alimenticio']) {
      expect(text.toLowerCase()).not.toContain(forbidden);
    }
  });
});
