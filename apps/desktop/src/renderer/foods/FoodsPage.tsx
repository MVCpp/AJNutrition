import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { FoodDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';

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
};

// Display-only mirror of nutrition-engine's exact factors (NIST).
const GRAMS_PER_UNIT: Record<FormState['basisUnit'], number> = {
  g: 1,
  oz: 28.349523125,
  lb: 453.59237,
};

const MACRO_FIELDS = [
  ['energyKcal', 'foods.energy', 'kcal', true],
  ['proteinG', 'foods.protein', 'g', true],
  ['carbohydrateG', 'foods.carbs', 'g', true],
  ['fatG', 'foods.fat', 'g', true],
  ['fiberG', 'foods.fiber', 'g', false],
  ['sodiumMg', 'foods.sodium', 'mg', false],
] as const;

const num = (value: string) => Number(value.trim().replace(',', '.'));

function nutrientOf(food: FoodDto, id: string): number | null {
  return food.nutrients.find((n) => n.nutrientId === id)?.amount ?? null;
}

export function FoodsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const foodsQuery = useQuery({
    queryKey: ['foods', search],
    queryFn: () => unwrap(window.ajnutrition.food.search(search ? { search } : {})),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const optional = (value: string) => (value.trim() === '' ? undefined : num(value));
      const isDefaultBasis = num(form.basisAmount) === 100 && form.basisUnit === 'g';
      return unwrap(
        window.ajnutrition.food.create({
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
        }),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['foods'] });
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
  });

  const errorMessage =
    createMutation.error instanceof ApiError
      ? `${createMutation.error.message} (${createMutation.error.detail.supportCode})`
      : null;

  const requiredFilled =
    form.name.trim() !== '' &&
    form.basisAmount.trim() !== '' &&
    ['energyKcal', 'proteinG', 'carbohydrateG', 'fatG'].every(
      (key) => form[key as keyof FormState].trim() !== '',
    );

  const basisAmountNumber = num(form.basisAmount);
  const basisGramsPreview =
    Number.isFinite(basisAmountNumber) && basisAmountNumber > 0
      ? Math.round(basisAmountNumber * GRAMS_PER_UNIT[form.basisUnit] * 100) / 100
      : null;

  // Atwater cross-check shown live while typing (same rule the backend uses
  // to attach the ⚠ kcal warning after saving).
  const macrosFilled = ['proteinG', 'carbohydrateG', 'fatG'].every(
    (key) => form[key as keyof FormState].trim() !== '',
  );
  const atwaterKcal = macrosFilled
    ? Math.round(4 * num(form.proteinG) + 4 * num(form.carbohydrateG) + 9 * num(form.fatG))
    : null;

  const basisLabel =
    form.basisUnit === 'g'
      ? `${form.basisAmount || '—'} g`
      : `${form.basisAmount || '—'} ${form.basisUnit}${basisGramsPreview !== null ? ` (= ${basisGramsPreview} g)` : ''}`;

  return (
    <section aria-labelledby="foods-heading">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="foods-heading" className="text-lg font-semibold">
            {t('foods.heading')}
          </h2>
          <p className="text-sm text-slate-500">{t('foods.intro')}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className={
            showForm
              ? 'rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100'
              : 'rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800'
          }
        >
          {showForm ? t('foods.closeForm') : t('foods.new')}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          noValidate
          className="mb-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-3">
            <h3 className="text-sm font-semibold text-slate-800">{t('foods.formTitle')}</h3>
            <p className="text-xs text-slate-500">{t('foods.formHint')}</p>
          </div>

          <div className="space-y-6 p-6">
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

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {MACRO_FIELDS.map(([key, labelKey, unit, required]) => (
                  <div key={key}>
                    <label htmlFor={`food-${key}`} className="mb-1 block text-sm font-medium">
                      {t(labelKey)}
                      {required && <span className="text-red-600"> *</span>}
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
                  {Math.abs(atwaterKcal - num(form.energyKcal)) >
                    Math.max(20, 0.15 * atwaterKcal) && (
                    <span className="ml-1 text-amber-700">{t('foods.atwaterMismatch')}</span>
                  )}
                </p>
              )}
            </fieldset>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
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
              disabled={createMutation.isPending || !requiredFilled}
              className="rounded-md bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {createMutation.isPending ? t('foods.saving') : t('foods.save')}
            </button>
          </div>
        </form>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
            ⌕
          </span>
          <input
            id="food-search"
            type="search"
            aria-label={t('foods.searchLabel')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('foods.searchPlaceholder')}
            className="w-full rounded-md border border-slate-300 py-2 pl-8 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        {foodsQuery.data && (
          <p className="text-xs text-slate-500">
            {t('foods.count', { count: foodsQuery.data.length })}
          </p>
        )}
      </div>

      {foodsQuery.isLoading && <p className="text-sm text-slate-500">{t('foods.loading')}</p>}
      {foodsQuery.isError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {t('foods.loadError', { message: (foodsQuery.error as Error).message })}
        </div>
      )}
      {foodsQuery.data && foodsQuery.data.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-600">{t('foods.empty')}</p>
          <p className="mt-1 text-xs text-slate-400">{t('foods.emptyHint')}</p>
        </div>
      )}

      {foodsQuery.data && foodsQuery.data.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('foods.colFood')}
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  {t('foods.colEnergy')}
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  {t('foods.colProtein')}
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  {t('foods.colCarbs')}
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  {t('foods.colFat')}
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  {t('foods.colFiber')}
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  {t('foods.colSodium')}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  {t('foods.colBasis')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {foodsQuery.data.map((food: FoodDto) => (
                <tr
                  key={food.id}
                  className="transition-colors odd:bg-white even:bg-slate-50/40 hover:bg-emerald-50/40"
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-800">{food.name}</span>
                      {food.warnings.includes('energy_macro_mismatch') && (
                        <span
                          className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800"
                          title={t('foods.mismatchWarning')}
                        >
                          ⚠ kcal
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-slate-500">
                      {food.brand && <span>{food.brand}</span>}
                      {food.category && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5">
                          {food.category}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-800">
                    {nutrientOf(food, 'energy_kcal') ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-600">
                    {nutrientOf(food, 'protein_g') ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-600">
                    {nutrientOf(food, 'carbohydrate_g') ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-600">
                    {nutrientOf(food, 'fat_g') ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-500">
                    {nutrientOf(food, 'fiber_g') ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-500">
                    {nutrientOf(food, 'sodium_mg') ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-slate-500">
                    {t('foods.perBasis', { grams: food.basisGrams })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
