import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AllergenId, FoodDto } from '@ajnutrition/shared';
import { ALLERGEN_IDS, ALLERGEN_LABELS } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';
import { Modal } from '../components/Modal';

/**
 * Dedicated create/edit screen for a food. Editing no longer shares the
 * inline "Nuevo alimento" form: it opens this modal pre-filled, so it works
 * from any row of the paginated table.
 */

interface FormState {
  name: string;
  brand: string;
  category: string;
  basisAmount: string;
  basisUnit: 'g' | 'oz' | 'lb';
  energyKcal: string;
  proteinG: string;
  carbohydrateG: string;
  fatG: string;
  fiberG: string;
  sodiumMg: string;
  allergens: AllergenId[];
}

const EMPTY_FORM: FormState = {
  name: '',
  brand: '',
  category: '',
  basisAmount: '100',
  basisUnit: 'g',
  energyKcal: '',
  proteinG: '',
  carbohydrateG: '',
  fatG: '',
  fiberG: '',
  sodiumMg: '',
  allergens: [],
};

// Display-only mirror of nutrition-engine's exact factors (NIST).
const GRAMS_PER_UNIT: Record<FormState['basisUnit'], number> = {
  g: 1,
  oz: 28.349523125,
  lb: 453.59237,
};

// Short one-line labels; the unit lives only in the input suffix so the
// six-column grid never wraps out of alignment.
const MACRO_FIELDS = [
  ['energyKcal', 'foods.shortEnergy', 'kcal', true],
  ['proteinG', 'foods.shortProtein', 'g', true],
  ['carbohydrateG', 'foods.shortCarbs', 'g', true],
  ['fatG', 'foods.shortFat', 'g', true],
  ['fiberG', 'foods.shortFiber', 'g', false],
  ['sodiumMg', 'foods.shortSodium', 'mg', false],
] as const;

const num = (value: string) => Number(value.trim().replace(',', '.'));

function initialForm(food: FoodDto | null): FormState {
  if (food === null) return EMPTY_FORM;
  const value = (id: string) => {
    const amount = food.nutrients.find((n) => n.nutrientId === id)?.amount;
    return amount === undefined ? '' : String(amount);
  };
  return {
    name: food.name,
    brand: food.brand ?? '',
    category: food.category ?? '',
    basisAmount: String(food.basisGrams),
    basisUnit: 'g',
    energyKcal: value('energy_kcal'),
    proteinG: value('protein_g'),
    carbohydrateG: value('carbohydrate_g'),
    fatG: value('fat_g'),
    fiberG: value('fiber_g'),
    sodiumMg: value('sodium_mg'),
    allergens: food.allergens.filter((id): id is AllergenId =>
      (ALLERGEN_IDS as readonly string[]).includes(id),
    ),
  };
}

export function FoodFormModal({ food, onClose }: { food: FoodDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialForm(food));

  const saveMutation = useMutation({
    mutationFn: () => {
      const optional = (value: string) => (value.trim() === '' ? undefined : num(value));
      const isDefaultBasis = num(form.basisAmount) === 100 && form.basisUnit === 'g';
      const payload = {
        name: form.name,
        brand: form.brand.trim() || undefined,
        category: form.category.trim() || undefined,
        energyKcal: num(form.energyKcal),
        proteinG: num(form.proteinG),
        carbohydrateG: num(form.carbohydrateG),
        fatG: num(form.fatG),
        fiberG: optional(form.fiberG),
        sodiumMg: optional(form.sodiumMg),
        ...(isDefaultBasis
          ? {}
          : { basis: { amount: num(form.basisAmount), unit: form.basisUnit } }),
        ...(form.allergens.length > 0 ? { allergens: form.allergens } : {}),
      };
      return food === null
        ? unwrap(window.ajnutrition.food.create(payload))
        : unwrap(window.ajnutrition.food.update({ ...payload, foodId: food.id }));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['foods'] });
      onClose();
    },
  });

  const errorMessage =
    saveMutation.error instanceof ApiError
      ? `${saveMutation.error.message} (${saveMutation.error.detail.supportCode})`
      : null;

  const requiredFilled =
    form.name.trim() !== '' &&
    form.basisAmount.trim() !== '' &&
    (['energyKcal', 'proteinG', 'carbohydrateG', 'fatG'] as const).every(
      (key) => form[key].trim() !== '',
    );

  const basisAmountNumber = num(form.basisAmount);
  const basisGramsPreview =
    Number.isFinite(basisAmountNumber) && basisAmountNumber > 0
      ? Math.round(basisAmountNumber * GRAMS_PER_UNIT[form.basisUnit] * 100) / 100
      : null;

  // Atwater cross-check shown live while typing (same rule the backend uses
  // to attach the ⚠ kcal warning after saving).
  const macrosFilled = (['proteinG', 'carbohydrateG', 'fatG'] as const).every(
    (key) => form[key].trim() !== '',
  );
  const atwaterKcal = macrosFilled
    ? Math.round(4 * num(form.proteinG) + 4 * num(form.carbohydrateG) + 9 * num(form.fatG))
    : null;

  const basisLabel =
    form.basisUnit === 'g'
      ? `${form.basisAmount || '—'} g`
      : `${form.basisAmount || '—'} ${form.basisUnit}${basisGramsPreview !== null ? ` (= ${basisGramsPreview} g)` : ''}`;

  return (
    <Modal
      icon="🥑"
      wide
      title={food === null ? t('foods.formTitle') : t('foods.editModalTitle', { name: food.name })}
      subtitle={t('foods.formHint')}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{t('foods.summaryBasis', { basis: basisLabel })}</span>
            {requiredFilled && (
              <span className="flex flex-wrap gap-1.5">
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800 tabular-nums">
                  {num(form.energyKcal)} kcal
                </span>
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800 tabular-nums">
                  P {num(form.proteinG)} g
                </span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 tabular-nums">
                  H {num(form.carbohydrateG)} g
                </span>
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800 tabular-nums">
                  G {num(form.fatG)} g
                </span>
              </span>
            )}
          </div>
          <button
            type="submit"
            form="food-form-modal"
            disabled={saveMutation.isPending || !requiredFilled}
            className="rounded-md bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {saveMutation.isPending
              ? t('foods.saving')
              : food === null
                ? t('foods.save')
                : t('foods.saveChanges')}
          </button>
        </div>
      }
    >
      <form
        id="food-form-modal"
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
        noValidate
        className="space-y-6"
      >
        {errorMessage && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {errorMessage}
          </div>
        )}

        <fieldset>
          <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t('foods.sectionIdentity')}
          </legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="food-name" className="mb-1 block text-sm font-medium">
                {t('foods.name')} <span className="text-red-600">*</span>
              </label>
              <input
                id="food-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
                placeholder={t('foods.namePlaceholder')}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label htmlFor="food-brand" className="mb-1 block text-sm font-medium">
                {t('foods.brand')}
              </label>
              <input
                id="food-brand"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder={t('foods.brandPlaceholder')}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label htmlFor="food-category" className="mb-1 block text-sm font-medium">
                {t('foods.category')}
              </label>
              <input
                id="food-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder={t('foods.categoryPlaceholder')}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t('foods.sectionNutrition')}
          </legend>

          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 px-4 py-3">
            <label htmlFor="food-basis-amount" className="text-sm font-medium text-slate-700">
              {t('foods.basisPrefix')}
            </label>
            <input
              id="food-basis-amount"
              type="text"
              inputMode="decimal"
              value={form.basisAmount}
              onChange={(e) => setForm({ ...form, basisAmount: e.target.value })}
              className="w-24 rounded-md border border-slate-300 px-3 py-1.5 text-right text-sm tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <select
              aria-label={t('foods.basisUnit')}
              value={form.basisUnit}
              onChange={(e) =>
                setForm({ ...form, basisUnit: e.target.value as FormState['basisUnit'] })
              }
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="g">{t('foods.unitG')}</option>
              <option value="oz">{t('foods.unitOz')}</option>
              <option value="lb">{t('foods.unitLb')}</option>
            </select>
            <span className="text-sm text-slate-600">{t('foods.basisSuffix')}</span>
            {form.basisUnit !== 'g' && basisGramsPreview !== null && (
              <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">
                = {basisGramsPreview} g
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 items-end gap-4 sm:grid-cols-3">
            {MACRO_FIELDS.map(([key, labelKey, unit, required]) => (
              <div key={key}>
                <label
                  htmlFor={`food-${key}`}
                  className="mb-1 flex items-center gap-1 whitespace-nowrap text-sm font-medium"
                >
                  {t(labelKey)}
                  {required ? (
                    <span className="text-red-600">*</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-400">
                      {t('foods.optionalTag')}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    id={`food-${key}`}
                    type="text"
                    inputMode="decimal"
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    placeholder="0"
                    className="w-full rounded-md border border-slate-300 py-2 pl-3 pr-11 text-right text-sm tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">
                    {unit}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {atwaterKcal !== null && form.energyKcal.trim() !== '' && (
            <p className="mt-3 text-xs text-slate-500">
              {t('foods.atwaterHint', { kcal: atwaterKcal })}
              {Math.abs(atwaterKcal - num(form.energyKcal)) > Math.max(20, 0.15 * atwaterKcal) && (
                <span className="ml-1 text-amber-700">{t('foods.atwaterMismatch')}</span>
              )}
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t('foods.sectionAllergens')}
          </legend>
          <p className="mb-3 text-xs text-slate-500">{t('foods.allergensHint')}</p>
          <div className="flex flex-wrap gap-2">
            {ALLERGEN_IDS.map((id) => {
              const active = form.allergens.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setForm({
                      ...form,
                      allergens: active
                        ? form.allergens.filter((a) => a !== id)
                        : [...form.allergens, id],
                    })
                  }
                  className={
                    active
                      ? 'rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-red-700'
                      : 'rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-red-300 hover:bg-red-50'
                  }
                >
                  {ALLERGEN_LABELS[id]}
                </button>
              );
            })}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
