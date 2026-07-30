// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SaveNoteTemplateCommand } from '@ajnutrition/shared';
import { ok, renderWithProviders, type OkResult } from '../test/harness';
import { ConsultationForm } from './ConsultationForm';

const template = {
  id: '00000000-0000-4000-8000-0000000000t1',
  name: 'Primera consulta — adulto',
  subjective: 'Motivo de consulta:',
  objective: null,
  assessment: null,
  plan: 'Plan inicial:',
  updatedAt: '2026-07-29T12:00:00.000Z',
};

const PATIENT_ID = '00000000-0000-4000-8000-0000000000aa';

function setup() {
  const create = vi.fn(() => ok({ id: 'c1' }));
  const saveTemplate = vi.fn<(command: SaveNoteTemplateCommand) => OkResult<typeof template>>(() =>
    ok(template),
  );
  renderWithProviders(<ConsultationForm patientId={PATIENT_ID} onCreated={vi.fn()} />, {
    consultation: {
      create,
      listTemplates: () => ok([template]),
      saveTemplate,
    } as never,
  });
  return { create, saveTemplate };
}

const subjective = () => screen.getByLabelText('Subjetivo (S)') as HTMLTextAreaElement;

describe('ConsultationForm templates', () => {
  it('fills the SOAP fields from a template', async () => {
    const user = userEvent.setup();
    setup();
    await waitFor(() => expect(screen.getByRole('option', { name: template.name })).toBeTruthy());

    await user.selectOptions(screen.getByLabelText('Plantilla:'), template.id);

    expect(subjective().value).toBe('Motivo de consulta:');
    expect((screen.getByLabelText('Plan (P)') as HTMLTextAreaElement).value).toBe('Plan inicial:');
  });

  it('asks before overwriting text the practitioner already typed', async () => {
    const user = userEvent.setup();
    setup();
    await waitFor(() => expect(screen.getByRole('option', { name: template.name })).toBeTruthy());
    await user.type(subjective(), 'Refiere apego parcial');

    // Declining must leave the typed note completely alone — silently
    // destroying it is the one failure this feature must never have.
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.selectOptions(screen.getByLabelText('Plantilla:'), template.id);
    expect(confirm).toHaveBeenCalled();
    expect(subjective().value).toBe('Refiere apego parcial');

    confirm.mockReturnValue(true);
    await user.selectOptions(screen.getByLabelText('Plantilla:'), template.id);
    expect(subjective().value).toBe('Motivo de consulta:');
    confirm.mockRestore();
  });

  it('does not ask when every field is still empty', async () => {
    const user = userEvent.setup();
    setup();
    await waitFor(() => expect(screen.getByRole('option', { name: template.name })).toBeTruthy());

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.selectOptions(screen.getByLabelText('Plantilla:'), template.id);
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('cannot save an empty note as a template', async () => {
    setup();
    const button = screen.getByRole('button', { name: 'Guardar como plantilla' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('saves the current note as a template under the name given', async () => {
    const user = userEvent.setup();
    const { saveTemplate } = setup();
    await user.type(subjective(), 'Texto reutilizable');

    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('  Control mensual  ');
    await user.click(screen.getByRole('button', { name: 'Guardar como plantilla' }));

    await waitFor(() => expect(saveTemplate).toHaveBeenCalledTimes(1));
    expect(saveTemplate.mock.calls[0]?.[0]).toMatchObject({
      // Trimmed, and carrying the text that was on screen.
      name: 'Control mensual',
      subjective: 'Texto reutilizable',
    });
    prompt.mockRestore();
  });

  it('does nothing when the name prompt is dismissed', async () => {
    const user = userEvent.setup();
    const { saveTemplate } = setup();
    await user.type(subjective(), 'Texto');

    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
    await user.click(screen.getByRole('button', { name: 'Guardar como plantilla' }));
    expect(saveTemplate).not.toHaveBeenCalled();
    prompt.mockRestore();
  });
});
