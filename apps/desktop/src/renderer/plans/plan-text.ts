import type { MealPlanDto } from '@ajnutrition/shared';

/**
 * A day of the plan as plain text, for pasting into WhatsApp or an email.
 *
 * The PDF is the document; this is how a patient in Mexico actually receives
 * their plan day to day. It reuses the SAME strings the app shows — including
 * the household measures ("2 × 1 pieza (60 g)") — so what she sends and what
 * she has on screen can never drift apart.
 *
 * Nothing is invented here: only labels and amounts already computed by the
 * engine. No patient name is included — the practitioner is pasting into a
 * conversation that already identifies the patient, and a name in the
 * clipboard is one more copy of it to lose.
 */

const SLOT_LABELS: Record<string, string> = {
  breakfast: 'Desayuno',
  snack1: 'Colación matutina',
  lunch: 'Comida',
  snack2: 'Colación vespertina',
  dinner: 'Cena',
};

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function planDayToText(plan: MealPlanDto, dayIndex: number): string {
  const day = plan.dayPlans[dayIndex];
  if (day === undefined) return '';

  const lines: string[] = [`${plan.name} — Día ${dayIndex + 1}`, ''];

  for (const meal of day.meals) {
    if (meal.items.length === 0) continue;
    lines.push(`*${SLOT_LABELS[meal.slot] ?? meal.slot}*`);
    for (const item of meal.items) {
      lines.push(`• ${item.label} — ${item.quantityLabel}`);
    }
    lines.push('');
  }

  if (lines.length === 2) return `${plan.name} — Día ${dayIndex + 1}\n\n(Sin alimentos)`;

  const total = (nutrientId: string) => day.totals.find((entry) => entry.nutrientId === nutrientId);
  const energy = total('energy_kcal');
  const protein = total('protein_g');
  const carbs = total('carbohydrate_g');
  const fat = total('fat_g');
  lines.push(
    `Total del día: ${round(energy?.amount ?? 0)} kcal · P ${round(protein?.amount ?? 0)} g · ` +
      `HC ${round(carbs?.amount ?? 0)} g · G ${round(fat?.amount ?? 0)} g`,
  );
  // Honesty about data gaps travels with the plan: a total computed from a
  // food missing that nutrient is a floor, not the truth.
  if ([energy, protein, carbs, fat].some((entry) => entry?.complete === false)) {
    lines.push('(Algunos alimentos no tienen todos los nutrientes; los totales son aproximados.)');
  }
  return lines.join('\n');
}
