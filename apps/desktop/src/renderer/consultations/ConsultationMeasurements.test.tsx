// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  ConsultationDto,
  CreateMeasurementCommand,
  MeasurementSessionDto,
  PatientDto,
} from '@ajnutrition/shared';
import { ok, renderWithProviders, type OkResult } from '../test/harness';
import { ConsultationMeasurements } from './ConsultationSections';

/**
 * The measurement form is where numbers enter the system that every later
 * calculation, chart and printed report is derived from. A value that is
 * silently altered on the way in is never noticed again.
 */

const patient = {
  id: '00000000-0000-4000-8000-0000000000aa',
  fileNumber: 1,
  firstName: 'Ana',
  lastName: 'Ruiz',
  dateOfBirth: '1990-05-14',
  sexAtBirth: 'female',
  email: null,
  phone: null,
  status: 'active',
  createdAt: '2026-07-01T12:00:00.000Z',
  updatedAt: '2026-07-01T12:00:00.000Z',
} as unknown as PatientDto;

const consultation = {
  id: '00000000-0000-4000-8000-0000000000c1',
  patientId: patient.id,
  consultationDate: '2026-07-20',
  consultationType: 'follow_up',
} as unknown as ConsultationDto;

const session = {
  id: '00000000-0000-4000-8000-0000000000s1',
  measuredAt: '2026-07-20',
  weightKg: 68.4,
  heightCm: 162,
  bodyFatPercent: 28.1,
  calculated: [
    { formulaId: 'bmi', roundedResult: 26.1 },
    { formulaId: 'mifflin_st_jeor_ree', roundedResult: 1420 },
  ],
} as unknown as MeasurementSessionDto;

function setup(sessions: MeasurementSessionDto[] = []) {
  const create = vi.fn<(command: CreateMeasurementCommand) => OkResult<typeof session>>(() =>
    ok(session),
  );
  renderWithProviders(
    <ConsultationMeasurements patient={patient} consultation={consultation} sessions={sessions} />,
    { measurement: { create } as never },
  );
  return { create };
}

const openForm = async (user: ReturnType<typeof userEvent.setup>) => {
  // SectionShell renders "+ {label}", so the accessible name has a prefix.
  await user.click(screen.getByRole('button', { name: /Agregar medición/ }));
};

const saveButton = () => screen.getByRole('button', { name: 'Guardar medición' });

describe('ConsultationMeasurements', () => {
  it('accepts the decimal comma, because that is how es-MX types numbers', async () => {
    const user = userEvent.setup();
    const { create } = setup();
    await openForm(user);

    await user.type(screen.getByLabelText('Peso'), '68,4');
    await user.type(screen.getByLabelText('Talla'), '162,5');
    await user.click(saveButton());

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    // 68.4, not 68 and not NaN — a comma silently truncating a weight would
    // shift every derived figure for that patient.
    expect(create.mock.calls[0]?.[0]).toMatchObject({ weightKg: 68.4, heightCm: 162.5 });
  });

  it('leaves untouched fields absent rather than sending zero', async () => {
    const user = userEvent.setup();
    const { create } = setup();
    await openForm(user);

    await user.type(screen.getByLabelText('Peso'), '70');
    await user.click(saveButton());

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const command = create.mock.calls[0]?.[0];
    // missing ≠ zero. A 0 cm waist is a measurement; a blank one is not.
    expect(command?.waistCm).toBeUndefined();
    expect(command?.bodyFatPercent).toBeUndefined();
    expect(command?.skinfoldTricepsMm).toBeUndefined();
  });

  it('cannot save a measurement with nothing in it', async () => {
    const user = userEvent.setup();
    setup();
    await openForm(user);

    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByLabelText('Peso'), '70');
    expect((saveButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('carries the consultation and its date, so the session is linked', async () => {
    const user = userEvent.setup();
    const { create } = setup();
    await openForm(user);

    await user.type(screen.getByLabelText('Peso'), '70');
    await user.click(saveButton());

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      patientId: patient.id,
      consultationId: consultation.id,
      measuredAt: '2026-07-20',
    });
  });

  it('omits clinical flags entirely when none are set', async () => {
    const user = userEvent.setup();
    const { create } = setup();
    await openForm(user);

    await user.type(screen.getByLabelText('Peso'), '70');
    await user.click(saveButton());

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    // An all-false flags object and no flags at all mean different things to
    // the engine; only send them when she actually set one.
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('clinicalFlags');
  });

  it('does not coerce unparseable text into a number', async () => {
    const user = userEvent.setup();
    const { create } = setup();
    await openForm(user);

    await user.type(screen.getByLabelText('Peso'), 'setenta');
    await user.click(saveButton());

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    // It travels as NaN and the main process refuses it with VALIDATION. That
    // is the correct failure: turning it into 0 — or dropping the field and
    // saving the rest — would record something she never measured.
    expect(Number.isNaN(create.mock.calls[0]?.[0].weightKg)).toBe(true);
  });

  it('shows a stored session with its derived figures', () => {
    setup([session]);

    const row = screen.getByText('2026-07-20').parentElement;
    expect(row?.textContent).toContain('68.4 kg');
    expect(row?.textContent).toContain('IMC 26.1');
    expect(row?.textContent).toContain('GER 1420 kcal');
  });

  it('says so when the consultation has no measurements yet', () => {
    setup([]);
    expect(screen.getByText('Sin mediciones vinculadas.')).toBeTruthy();
  });
});
