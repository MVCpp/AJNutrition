// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AddPlanItemCommand, MealPlanDto } from '@ajnutrition/shared';
import { ok, renderWithProviders, type OkResult } from '../test/harness';
import { PlanEditor } from './PlanEditor';

/**
 * The plan editor is where grams get decided, and the plan is the artifact the
 * patient takes home. Two invariants matter more than anything else here
 * (threat model T-28):
 *
 *  - when a household measure is used, the RENDERER names the measure and the
 *    main process computes the grams. Sending grams we computed ourselves
 *    would let a stale measure store an amount that disagrees with its label.
 *  - an amount that cannot be resolved must block the submit rather than
 *    silently fall back to grams.
 */

const PLAN_ID = '00000000-0000-4000-8000-0000000000p1';
const FOOD_ID = '00000000-0000-4000-8000-0000000000f1';
const SERVING_ID = '00000000-0000-4000-8000-0000000000e1';

const total = (amount: number, complete = true) => ({
  // The day-totals strip renders a fixed macro list; 'energy_kcal' is the id
  // it looks for, not 'energy'.
  nutrientId: 'energy_kcal',
  nameEs: 'Energía',
  unit: 'kcal',
  amount,
  complete,
});

function plan(overrides: Partial<MealPlanDto> = {}): MealPlanDto {
  return {
    id: PLAN_ID,
    patientId: '00000000-0000-4000-8000-0000000000aa',
    name: 'Plan de julio',
    days: 1,
    status: 'draft',
    targets: { energyKcal: 2000, proteinG: 100, carbohydrateG: 250, fatG: 60 },
    targetSource: {},
    consultationId: null,
    allergies: [],
    dayPlans: [
      {
        dayIndex: 0,
        meals: [
          { slot: 'breakfast', items: [], totals: [], targetKcal: null },
          { slot: 'snack1', items: [], totals: [], targetKcal: null },
          { slot: 'lunch', items: [], totals: [], targetKcal: null },
          { slot: 'snack2', items: [], totals: [], targetKcal: null },
          { slot: 'dinner', items: [], totals: [], targetKcal: null },
        ],
        totals: [total(1800)],
        equivalents: [],
      },
    ],
    equivalentTargets: null,
    mealDistribution: null,
    notes: null,
    createdAt: '2026-07-01T12:00:00.000Z',
    ...overrides,
  } as MealPlanDto;
}

const tortilla = {
  id: FOOD_ID,
  name: 'Tortilla de maíz',
  allergens: [],
  servings: [{ id: SERVING_ID, name: 'pieza', grams: 30 }],
};

function setup(
  planData: MealPlanDto = plan(),
  foods: unknown[] = [tortilla],
  history: unknown[] = [],
) {
  const addItem = vi.fn<(command: AddPlanItemCommand) => OkResult<MealPlanDto>>(() => ok(planData));
  renderWithProviders(<PlanEditor planId={PLAN_ID} onBack={vi.fn()} />, {
    plan: { get: () => ok(planData), addItem, removeItem: vi.fn() } as never,
    food: { search: () => ok(foods) } as never,
    recipe: { search: () => ok([]) } as never,
    history: { list: () => ok(history) } as never,
    photo: { list: () => ok([]) } as never,
    patient: { list: () => ok([]) } as never,
  });
  return { addItem };
}

/** Opens the "add food" row on the first meal slot. */
async function openAddFood(user: ReturnType<typeof userEvent.setup>) {
  const buttons = await screen.findAllByRole('button', { name: '+ Alimento' });
  await user.click(buttons[0] as HTMLElement);
}

const addButton = () => screen.getByRole('button', { name: 'Agregar' });

describe('PlanEditor — adding a food', () => {
  it('sends grams when no household measure is chosen', async () => {
    const user = userEvent.setup();
    const { addItem } = setup();
    await openAddFood(user);

    await user.selectOptions(screen.getByLabelText('Alimentos'), FOOD_ID);
    await user.type(screen.getByLabelText('g'), '60');
    await user.click(addButton());

    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem.mock.calls[0]?.[0].item).toEqual({ type: 'food', foodId: FOOD_ID, grams: 60 });
  });

  it('sends the measure and quantity — never grams — when a measure is chosen', async () => {
    const user = userEvent.setup();
    const { addItem } = setup();
    await openAddFood(user);

    await user.selectOptions(screen.getByLabelText('Alimentos'), FOOD_ID);
    await user.type(screen.getByLabelText('g'), '2');
    await user.selectOptions(screen.getByLabelText('Unidad'), SERVING_ID);
    await user.click(addButton());

    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    const item = addItem.mock.calls[0]?.[0].item as Record<string, unknown>;
    // Main resolves the measure and computes the grams itself, so a stale or
    // hostile client cannot store a label that disagrees with the amount.
    expect(item).toEqual({
      type: 'food',
      foodId: FOOD_ID,
      serving: { servingId: SERVING_ID, quantity: 2 },
    });
    expect(item).not.toHaveProperty('grams');
  });

  it('accepts the decimal comma in a quantity', async () => {
    const user = userEvent.setup();
    const { addItem } = setup();
    await openAddFood(user);

    await user.selectOptions(screen.getByLabelText('Alimentos'), FOOD_ID);
    await user.type(screen.getByLabelText('g'), '1,5');
    await user.selectOptions(screen.getByLabelText('Unidad'), SERVING_ID);
    await user.click(addButton());

    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    const item = addItem.mock.calls[0]?.[0].item as { serving: { quantity: number } };
    expect(item.serving.quantity).toBe(1.5);
  });

  it('shows the gram equivalent of the chosen measure while typing', async () => {
    const user = userEvent.setup();
    setup();
    await openAddFood(user);

    await user.selectOptions(screen.getByLabelText('Alimentos'), FOOD_ID);
    await user.type(screen.getByLabelText('g'), '2');
    await user.selectOptions(screen.getByLabelText('Unidad'), SERVING_ID);

    // 2 piezas × 30 g. The amount must never be ambiguous on screen.
    expect(screen.getByText(/60 g/)).toBeTruthy();
  });

  it('refuses to add until a food and a usable amount are both present', async () => {
    const user = userEvent.setup();
    setup();
    await openAddFood(user);

    expect((addButton() as HTMLButtonElement).disabled).toBe(true);

    await user.selectOptions(screen.getByLabelText('Alimentos'), FOOD_ID);
    expect((addButton() as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByLabelText('g'), 'mucho');
    // Unparseable: blocked rather than quietly treated as grams or as zero.
    expect((addButton() as HTMLButtonElement).disabled).toBe(true);

    await user.clear(screen.getByLabelText('g'));
    await user.type(screen.getByLabelText('g'), '60');
    expect((addButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('offers the measure picker only for foods that have one', async () => {
    const user = userEvent.setup();
    const plain = { id: FOOD_ID, name: 'Arroz', allergens: [], servings: [] };
    setup(plan(), [plain]);
    await openAddFood(user);

    await user.selectOptions(screen.getByLabelText('Alimentos'), FOOD_ID);
    expect(screen.queryByLabelText('Unidad')).toBeNull();
  });
});

describe('PlanEditor — what the practitioner is warned about', () => {
  it('marks a total built from incomplete data as a minimum', async () => {
    const incomplete = plan();
    incomplete.dayPlans[0]!.totals = [total(1800, false)];
    setup(incomplete);

    // A "≥" chip, not a bare number: the total is a floor, and presenting it
    // as exact would invite prescribing against a figure that is not one.
    const chip = await screen.findByTitle(/el total es un mínimo/);
    expect(chip.textContent).toContain('≥');
  });

  it('does not mark a complete total', async () => {
    setup();
    await screen.findAllByRole('button', { name: '+ Alimento' });
    expect(screen.queryByTitle(/el total es un mínimo/)).toBeNull();
  });

  it('blocks a food the patient is allergic to, without hiding it', async () => {
    const user = userEvent.setup();
    const nuts = { id: FOOD_ID, name: 'Cacahuate', allergens: ['peanut'], servings: [] };
    // The block list is built from the LIVE clinical history, not from the
    // snapshot on the plan — an allergy recorded today must bite immediately.
    setup(plan(), [nuts], [{ category: 'allergy', allergenId: 'peanut' }]);
    await openAddFood(user);

    const option = screen.getByRole('option', { name: /Cacahuate/ }) as HTMLOptionElement;
    // Disabled and labelled with the reason — removing it from the list would
    // just look like the food is missing from the catalogue.
    expect(option.disabled).toBe(true);
    expect(option.textContent).toContain('contiene Cacahuate');
  });

  it('offers no editing controls on an archived plan', async () => {
    setup(plan({ status: 'archived' }));
    await screen.findByText('Plan de julio');

    expect(screen.queryByRole('button', { name: '+ Alimento' })).toBeNull();
  });
});
