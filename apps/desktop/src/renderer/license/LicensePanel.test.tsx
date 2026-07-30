// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ActivateLicenseCommand, LicenseStatusDto } from '@ajnutrition/shared';
import { ok, renderWithProviders, type OkResult } from '../test/harness';
import { LicensePanel } from './LicensePanel';
import { LicenseBanner } from './LicenseBanner';
import { LicenseLockNotice } from './LicenseLockNotice';

const base: LicenseStatusDto = {
  enforced: true,
  state: 'active',
  canWrite: true,
  holder: 'Nutrióloga Ana Jiménez',
  plan: 'annual',
  licenseId: 'lic_0001',
  deviceId: '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  endsAt: '2027-01-01T00:00:00.000Z',
  daysRemaining: 120,
  invalidToken: false,
  clockTampered: false,
};

/** The heading carries an emoji, so its text node is split — match the role. */
const heading = () => screen.findByRole('heading', { name: /Suscripción/ });

function renderPanel(status: Partial<LicenseStatusDto> = {}) {
  const activate = vi.fn<(command: ActivateLicenseCommand) => OkResult<LicenseStatusDto>>(() =>
    ok({ ...base, ...status }),
  );
  const loadFromFile = vi.fn(() => ok({ canceled: true, status: { ...base, ...status } }));
  renderWithProviders(<LicensePanel />, {
    license: {
      getStatus: () => ok({ ...base, ...status }),
      activate,
      loadFromFile,
    } as never,
  });
  return { activate, loadFromFile };
}

describe('LicensePanel', () => {
  it('stays completely hidden while licensing is not enforced', async () => {
    renderPanel({ enforced: false });
    // Nothing to wait for: the panel must never flash in and out on load.
    await waitFor(() => expect(screen.queryByRole('heading')).toBeNull());
  });

  it('shows who the licence belongs to and when it runs out', async () => {
    renderPanel();

    expect(await heading()).toBeTruthy();
    expect(screen.getByText('Activa')).toBeTruthy();
    expect(screen.getByText('Nutrióloga Ana Jiménez')).toBeTruthy();
    expect(screen.getByText('lic_0001')).toBeTruthy();
    expect(screen.getByText('(120 días)')).toBeTruthy();
  });

  it('spells out that expired means read-only, not locked out', async () => {
    renderPanel({ state: 'expired', canWrite: false, daysRemaining: 0 });

    const explanation = await screen.findByText(/Sus expedientes siguen siendo suyos/);
    // The three things she will actually worry about must be named.
    expect(explanation.textContent).toMatch(/imprimirlos/);
    expect(explanation.textContent).toMatch(/exportarlos/);
    expect(explanation.textContent).toMatch(/respaldarlos/);
  });

  it('sends a pasted token through, trimmed by the main process', async () => {
    const user = userEvent.setup();
    const { activate } = renderPanel();
    await heading();

    await user.type(screen.getByLabelText('Pegue aquí el texto de su licencia'), 'NPL1.abc.def');
    await user.click(screen.getByRole('button', { name: 'Activar licencia' }));

    await waitFor(() => expect(activate).toHaveBeenCalledTimes(1));
    expect(activate.mock.calls[0]?.[0]).toEqual({ token: 'NPL1.abc.def' });
  });

  it('cannot submit an empty token', async () => {
    renderPanel();
    await heading();

    expect((screen.getByRole('button', { name: 'Activar licencia' }) as HTMLButtonElement).disabled) //
      .toBe(true);
  });

  it('says so when the stored licence file does not verify', async () => {
    renderPanel({ invalidToken: true, state: 'trial', holder: null, plan: null, licenseId: null });

    expect(await screen.findByText(/no se pudo verificar/)).toBeTruthy();
  });
});

describe('LicenseBanner', () => {
  function renderBanner(status: Partial<LicenseStatusDto>) {
    const onOpenSettings = vi.fn();
    renderWithProviders(<LicenseBanner onOpenSettings={onOpenSettings} />, {
      license: { getStatus: () => ok({ ...base, ...status }) } as never,
    });
    return { onOpenSettings };
  }

  it('says nothing while the subscription is active', async () => {
    renderBanner({});
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('counts down the grace period without blocking anything', async () => {
    renderBanner({ state: 'grace', daysRemaining: 10 });

    const banner = await screen.findByRole('status');
    expect(banner.textContent).toContain('10 días más');
  });

  it('leads with what still works once expired', async () => {
    renderBanner({ state: 'expired', canWrite: false, daysRemaining: 0 });

    const banner = await screen.findByRole('status');
    expect(banner.textContent).toMatch(/consultar, imprimir, exportar y respaldar/);
  });

  it('takes her to Ajustes to fix it', async () => {
    const user = userEvent.setup();
    const { onOpenSettings } = renderBanner({ state: 'expired', canWrite: false });

    await user.click(await screen.findByRole('button', { name: 'Ver suscripción' }));
    expect(onOpenSettings).toHaveBeenCalled();
  });
});

describe('LicenseLockNotice', () => {
  function renderNotice(status: Partial<LicenseStatusDto>) {
    renderWithProviders(<LicenseLockNotice />, {
      license: { getStatus: () => ok({ ...base, ...status }) } as never,
    });
  }

  it('warns about read-only BEFORE the passphrase is typed', async () => {
    renderNotice({ state: 'expired', canWrite: false, daysRemaining: 0 });

    // This is the entire reason license.json lives outside the encrypted DB:
    // status is readable while locked, so read-only is not a surprise found
    // on the other side of the unlock screen.
    const notice = await screen.findByRole('status');
    expect(notice.textContent).toMatch(/Al entrar podrá consultar, imprimir, exportar y respaldar/);
  });

  it('counts down the trial on the lock screen', async () => {
    renderNotice({ state: 'trial', holder: null, plan: null, daysRemaining: 3 });

    expect((await screen.findByRole('status')).textContent).toContain('3 días de prueba');
  });

  it('stays silent while the subscription is active', async () => {
    renderNotice({});
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('stays silent when licensing is not enforced', async () => {
    renderNotice({ enforced: false, state: 'expired' });
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });
});
