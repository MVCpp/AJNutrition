// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  CoachShareGrantDto,
  GrantCoachShareCommand,
  PatientCoachLinkDto,
  PatientDto,
  PatientSharingDto,
  ShareScopeDto,
} from '@ajnutrition/shared';
import { ok, renderWithProviders, type OkResult } from '../test/harness';
import { CoachSharingPanel } from './CoachSharingPanel';

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

const link: PatientCoachLinkDto = {
  id: '00000000-0000-4000-8000-0000000000cc',
  patientId: patient.id,
  coachId: '00000000-0000-4000-8000-0000000000bb',
  coachDisplayName: 'Carlos Ruiz',
  coachStatus: 'active',
  linkedAt: '2026-08-01T10:00:00.000Z',
  revokedAt: null,
  revokedReason: null,
};

const SCOPE: ShareScopeDto = {
  measurements: true,
  bodyComposition: true,
  planTargets: false,
  adherence: false,
  photos: false,
};

const EMPTY_SCOPE: ShareScopeDto = {
  measurements: false,
  bodyComposition: false,
  planTargets: false,
  adherence: false,
  photos: false,
};

function grantDto(overrides: Partial<CoachShareGrantDto> = {}): CoachShareGrantDto {
  return {
    id: '00000000-0000-4000-8000-0000000000ee',
    linkId: link.id,
    consentId: '00000000-0000-4000-8000-0000000000ff',
    coachId: link.coachId,
    coachDisplayName: 'Carlos Ruiz',
    scope: SCOPE,
    effectiveScope: SCOPE,
    effective: true,
    reason: null,
    grantedAt: '2026-08-02T10:00:00.000Z',
    revokedAt: null,
    revokedReason: null,
    ...overrides,
  };
}

/** Defaults to no photo consent, which is the state most patients are in. */
function setup(
  sharing: Omit<PatientSharingDto, 'photoConsentActive'> & { photoConsentActive?: boolean },
) {
  const grantShare = vi.fn<(command: GrantCoachShareCommand) => OkResult<CoachShareGrantDto>>(() =>
    ok(grantDto()),
  );
  const revokeShare = vi.fn(() => ok(grantDto({ revokedAt: '2026-08-06T10:00:00.000Z' })));
  const full: PatientSharingDto = { photoConsentActive: false, ...sharing };
  renderWithProviders(<CoachSharingPanel patient={patient} link={link} />, {
    coach: { sharing: () => ok(full), grantShare, revokeShare } as never,
  });
  return { grantShare, revokeShare };
}

describe('CoachSharingPanel', () => {
  it('cannot authorise anything until a transfer consent exists', async () => {
    setup({ grants: [], eligibleConsents: [] });
    expect(await screen.findByText(/Transferencia a terceros/i)).toBeTruthy();
    // No scope picker, no grant button — there is nothing to authorise with.
    expect(screen.queryByRole('button', { name: 'Autorizar' })).toBeNull();
  });

  it('sends the chosen consent and scope', async () => {
    const user = userEvent.setup();
    const { grantShare } = setup({
      grants: [],
      eligibleConsents: [
        {
          consentId: '00000000-0000-4000-8000-0000000000ff',
          noticeVersion: 'AVISO-2026-08',
          method: 'written',
          decidedAt: '2026-08-02T09:00:00.000Z',
        },
      ],
    });

    await user.selectOptions(
      await screen.findByLabelText(/Consentimiento que lo autoriza/),
      '00000000-0000-4000-8000-0000000000ff',
    );
    await user.click(screen.getByLabelText('Adherencia'));
    await user.click(screen.getByRole('button', { name: 'Autorizar' }));

    await waitFor(() => expect(grantShare).toHaveBeenCalledTimes(1));
    const command = grantShare.mock.calls[0]?.[0];
    expect(command?.consentId).toBe('00000000-0000-4000-8000-0000000000ff');
    expect(command?.scope).toEqual({ ...SCOPE, adherence: true });
    // Photos are never on by default.
    expect(command?.scope.photos).toBe(false);
  });

  it('warns while she is deciding that photos need a photo consent too', async () => {
    // After the fact is too late: by then she has told the trainer photos are
    // coming, and the document will not contain any.
    const user = userEvent.setup();
    setup({
      grants: [],
      eligibleConsents: [
        {
          consentId: '00000000-0000-4000-8000-0000000000ff',
          noticeVersion: 'AVISO-2026-08',
          method: 'written',
          decidedAt: '2026-08-02T09:00:00.000Z',
        },
      ],
      photoConsentActive: false,
    });

    expect(screen.queryByText(/no se compartirán hasta/i)).toBeNull();
    await user.click(await screen.findByLabelText('Fotografías de progreso'));
    expect(screen.getByText(/no se compartirán hasta/i)).toBeTruthy();
  });

  it('says out loud when a withdrawn consent has stopped the sharing', async () => {
    // An authorisation that silently stopped working looks identical to one
    // quietly still running. She has to be able to tell them apart.
    setup({
      grants: [
        grantDto({
          effective: false,
          reason: 'consent_not_accepted',
          effectiveScope: EMPTY_SCOPE,
        }),
      ],
      eligibleConsents: [],
    });

    expect(await screen.findByText('Autorización sin efecto')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('retiró el consentimiento');
    expect(screen.queryByText('Autorización vigente')).toBeNull();
  });

  it('shows a live authorisation with its scope, and asks before revoking', async () => {
    const user = userEvent.setup();
    const { revokeShare } = setup({ grants: [grantDto()], eligibleConsents: [] });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    expect(await screen.findByText('Autorización vigente')).toBeTruthy();
    expect(screen.getByText('Mediciones y peso')).toBeTruthy();
    // Not granted, so not listed.
    expect(screen.queryByText('Fotografías de progreso')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Retirar autorización' }));
    expect(revokeShare).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Retirar autorización' }));
    await waitFor(() => expect(revokeShare).toHaveBeenCalledWith({ grantId: grantDto().id }));
    confirm.mockRestore();
  });

  it('strikes through a category the authorisation no longer covers', async () => {
    // The grant still says photos; the photo consent no longer does. A chip
    // reading "Fotografías de progreso" with no qualification is a promise the
    // document does not keep.
    setup({
      grants: [
        grantDto({
          scope: { ...SCOPE, photos: true },
          effectiveScope: { ...SCOPE, photos: false },
          effective: true,
          reason: null,
        }),
      ],
      eligibleConsents: [],
    });

    const chip = await screen.findByText('Fotografías de progreso');
    expect(chip.className).toContain('line-through');
    expect(screen.getByText(/falta el consentimiento de fotografías/i)).toBeTruthy();
  });

  it('lists past authorisations — the ARCO "who could see my data" answer', async () => {
    setup({
      grants: [
        grantDto({
          revokedAt: '2026-08-04T10:00:00.000Z',
          effective: false,
          reason: 'grant_revoked',
        }),
      ],
      eligibleConsents: [],
    });
    expect(await screen.findByText(/Autorizaciones anteriores/)).toBeTruthy();
  });
});
