// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CreatePatientCommand, UpdatePatientCommand } from '@ajnutrition/shared';
import { ok, renderWithProviders, type OkResult } from '../test/harness';
import { PatientForm } from './PatientForm';

const created = {
  id: '00000000-0000-4000-8000-0000000000aa',
  fileNumber: 1,
  firstName: 'Juan',
  lastName: 'Pérez',
  dateOfBirth: '1990-05-14',
  sexAtBirth: 'male',
  email: null,
  phone: null,
  status: 'active',
  createdAt: '2026-07-29T12:00:00.000Z',
  updatedAt: '2026-07-29T12:00:00.000Z',
};

function setup() {
  // Typed via the generic so `mock.calls` is inspectable without declaring an
  // unused parameter the implementation would ignore.
  const create = vi.fn<(command: CreatePatientCommand) => OkResult<typeof created>>(() =>
    ok(created),
  );
  const onCreated = vi.fn();
  renderWithProviders(<PatientForm onCreated={onCreated} />, {
    patient: { create } as never,
  });
  return { create, onCreated };
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Nombre\(s\)/), 'Juan');
  await user.type(screen.getByLabelText(/Apellido\(s\)/), 'Pérez');
  await user.type(screen.getByLabelText(/Fecha de nacimiento/), '1990-05-14');
}

describe('PatientForm', () => {
  it('saves with the contact fields left empty', async () => {
    // This shipped broken once: untouched optional inputs submit '', which the
    // schema rejected as an invalid email, so a patient could not be created
    // without both an email AND a phone. E2E caught it; this pins it cheaply.
    const user = userEvent.setup();
    const { create, onCreated } = setup();

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Guardar paciente' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const command = create.mock.calls[0]?.[0];
    expect(command).toMatchObject({ firstName: 'Juan', lastName: 'Pérez' });
    // Absent, not empty strings.
    expect(command?.email).toBeUndefined();
    expect(command?.phone).toBeUndefined();
    expect(onCreated).toHaveBeenCalled();
  });

  it('sends the contact fields when they are filled in', async () => {
    const user = userEvent.setup();
    const { create } = setup();

    await fillRequired(user);
    await user.type(screen.getByLabelText(/Correo/), 'juan@example.com');
    await user.type(screen.getByLabelText(/Teléfono/), '+52 55 1234 5678');
    await user.click(screen.getByRole('button', { name: 'Guardar paciente' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      email: 'juan@example.com',
      phone: '+52 55 1234 5678',
    });
  });

  it('refuses to submit without a name and says why in Spanish', async () => {
    const user = userEvent.setup();
    const { create } = setup();

    await user.type(screen.getByLabelText(/Fecha de nacimiento/), '1990-05-14');
    await user.click(screen.getByRole('button', { name: 'Guardar paciente' }));

    // The message is translated, not a raw Zod code like 'required'.
    expect(await screen.findAllByText('Este campo es obligatorio.')).toHaveLength(2);
    expect(create).not.toHaveBeenCalled();
  });

  it('prefills every field when editing an existing patient', () => {
    renderWithProviders(
      <PatientForm
        patient={{ ...created, email: 'ana@example.com', phone: '5555555555' } as never}
        onCreated={vi.fn()}
      />,
      { patient: { update: vi.fn() } as never },
    );

    // Plain `.value` rather than a jest-dom matcher: this workspace does not
    // load jest-dom, and one dependency fewer is worth an explicit cast.
    const valueOf = (label: RegExp) => (screen.getByLabelText(label) as HTMLInputElement).value;
    expect(valueOf(/Nombre\(s\)/)).toBe('Juan');
    expect(valueOf(/Fecha de nacimiento/)).toBe('1990-05-14');
    expect(valueOf(/Correo/)).toBe('ana@example.com');
  });

  it('updates instead of creating when given a patient', async () => {
    const user = userEvent.setup();
    const update = vi.fn<(command: UpdatePatientCommand) => OkResult<typeof created>>(() =>
      ok(created),
    );
    const create = vi.fn();
    renderWithProviders(<PatientForm patient={created as never} onCreated={vi.fn()} />, {
      patient: { update, create } as never,
    });

    await user.click(screen.getByRole('button', { name: 'Guardar paciente' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(create).not.toHaveBeenCalled();
    expect(update.mock.calls[0]?.[0]).toMatchObject({ patientId: created.id });
  });
});
