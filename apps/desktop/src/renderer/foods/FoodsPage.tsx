import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { FoodDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';

interface FormState {
  name: string;
  brand: string;
  category: string;
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
  energyKcal: '',
  proteinG: '',
  carbohydrateG: '',
  fatG: '',
  fiberG: '',
  sodiumMg: '',
};

const MACRO_FIELDS = [
  ['energyKcal', 'foods.energy'],
  ['proteinG', 'foods.protein'],
  ['carbohydrateG', 'foods.carbs'],
  ['fatG', 'foods.fat'],
  ['fiberG', 'foods.fiber'],
  ['sodiumMg', 'foods.sodium'],
] as const;

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
      const num = (value: string) => Number(value.trim().replace(',', '.'));
      const optional = (value: string) => (value.trim() === '' ? undefined : num(value));
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
    ['energyKcal', 'proteinG', 'carbohydrateG', 'fatG'].every(
      (key) => form[key as keyof FormState].trim() !== '',
    );

  return (
    <section aria-labelledby="foods-heading">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 id="foods-heading" className="text-lg font-semibold">
          {t('foods.heading')}
        </h2>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
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
          className="mb-8 rounded-lg border border-slate-200 bg-white p-6"
        >
          {errorMessage && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {errorMessage}
            </div>
          )}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="food-name" className="mb-1 block text-sm font-medium">
                {t('foods.name')}
              </label>
              <input
                id="food-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <h3 className="mb-2 text-xs font-medium uppercase text-slate-500">
            {t('foods.per100g')}
          </h3>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-6">
            {MACRO_FIELDS.map(([key, labelKey]) => (
              <div key={key}>
                <label htmlFor={`food-${key}`} className="mb-1 block text-sm font-medium">
                  {t(labelKey)}
                </label>
                <input
                  id={`food-${key}`}
                  type="text"
                  inputMode="decimal"
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            ))}
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending || !requiredFilled}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {createMutation.isPending ? t('foods.saving') : t('foods.save')}
          </button>
        </form>
      )}

      <div className="mb-4">
        <label htmlFor="food-search" className="mb-1 block text-sm font-medium text-slate-700">
          {t('foods.searchLabel')}
        </label>
        <input
          id="food-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('foods.searchPlaceholder')}
          className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
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
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {t('foods.empty')}
        </div>
      )}

      <ul className="space-y-2">
        {foodsQuery.data?.map((food: FoodDto) => (
          <li key={food.id} className="rounded-md border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-800">{food.name}</span>
              {food.brand && <span className="text-xs text-slate-500">{food.brand}</span>}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {t('foods.sourceCustom')}
              </span>
              {food.warnings.includes('energy_macro_mismatch') && (
                <span
                  className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800"
                  title={t('foods.mismatchWarning')}
                >
                  ⚠ kcal
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {food.nutrients.map((n) => `${n.nameEs}: ${n.amount} ${n.unit}`).join(' · ')}{' '}
              <span className="text-slate-400">/ {food.basisGrams} g</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
