import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { FoodDto, RecipeDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';

interface IngredientRow {
  foodId: string;
  grams: string;
}

const num = (value: string) => Number(value.trim().replace(',', '.'));

function macroOf(list: RecipeDto['perPortion'], id: string) {
  return list.find((n) => n.nutrientId === id);
}

export function RecipesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [yieldPortions, setYieldPortions] = useState('1');
  const [instructions, setInstructions] = useState('');
  const [rows, setRows] = useState<IngredientRow[]>([{ foodId: '', grams: '' }]);

  const recipesQuery = useQuery({
    queryKey: ['recipes', search],
    queryFn: () => unwrap(window.ajnutrition.recipe.search(search ? { search } : {})),
  });

  // Full catalog for the ingredient selectors (100 foods is plenty for v1).
  const foodsQuery = useQuery({
    queryKey: ['foods', ''],
    queryFn: () => unwrap(window.ajnutrition.food.search({})),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      unwrap(
        window.ajnutrition.recipe.create({
          name,
          description: description.trim() || undefined,
          yieldPortions: num(yieldPortions),
          instructions: instructions.trim() || undefined,
          ingredients: rows
            .filter((row) => row.foodId !== '' && row.grams.trim() !== '')
            .map((row) => ({ foodId: row.foodId, grams: num(row.grams) })),
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['recipes'] });
      setShowForm(false);
      setName('');
      setDescription('');
      setYieldPortions('1');
      setInstructions('');
      setRows([{ foodId: '', grams: '' }]);
    },
  });

  const errorMessage =
    createMutation.error instanceof ApiError
      ? `${createMutation.error.message} (${createMutation.error.detail.supportCode})`
      : null;

  const validRows = rows.filter((row) => row.foodId !== '' && row.grams.trim() !== '');
  const canSave = name.trim() !== '' && validRows.length > 0 && yieldPortions.trim() !== '';

  // Live kcal preview from the loaded catalog — display-only; the saved
  // totals are computed by the nutrition engine on the backend.
  const previewKcal = validRows.reduce((sum, row) => {
    const food = foodsQuery.data?.find((f: FoodDto) => f.id === row.foodId);
    const kcal = food?.nutrients.find((n) => n.nutrientId === 'energy_kcal')?.amount;
    if (food === undefined || kcal === undefined) return sum;
    return sum + (kcal * num(row.grams)) / food.basisGrams;
  }, 0);
  const previewPortions = num(yieldPortions);
  const previewPerPortion =
    Number.isFinite(previewPortions) && previewPortions > 0 ? previewKcal / previewPortions : null;

  return (
    <section aria-labelledby="recipes-heading">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="recipes-heading" className="text-lg font-semibold">
            {t('recipes.heading')}
          </h2>
          <p className="text-sm text-slate-500">{t('recipes.intro')}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className={
            showForm
              ? 'rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100'
              : 'rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800'
          }
        >
          {showForm ? t('recipes.closeForm') : t('recipes.new')}
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
            <h3 className="text-sm font-semibold text-slate-800">{t('recipes.formTitle')}</h3>
            <p className="text-xs text-slate-500">{t('recipes.formHint')}</p>
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
                {t('recipes.sectionIdentity')}
              </legend>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label htmlFor="recipe-name" className="mb-1 block text-sm font-medium">
                    {t('recipes.name')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="recipe-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                    placeholder={t('recipes.namePlaceholder')}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label htmlFor="recipe-yield" className="mb-1 block text-sm font-medium">
                    {t('recipes.yield')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="recipe-yield"
                    type="text"
                    inputMode="decimal"
                    value={yieldPortions}
                    onChange={(e) => setYieldPortions(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-right text-sm tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t('recipes.ingredients')}
              </legend>
              <div className="space-y-2">
                {rows.map((row, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="w-6 text-right text-xs tabular-nums text-slate-400">
                      {index + 1}.
                    </span>
                    <select
                      aria-label={t('recipes.ingredientFood')}
                      value={row.foodId}
                      onChange={(e) =>
                        setRows(
                          rows.map((r, i) => (i === index ? { ...r, foodId: e.target.value } : r)),
                        )
                      }
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">{t('recipes.pickFood')}</option>
                      {foodsQuery.data?.map((food: FoodDto) => (
                        <option key={food.id} value={food.id}>
                          {food.name}
                          {food.brand ? ` (${food.brand})` : ''}
                        </option>
                      ))}
                    </select>
                    <div className="relative">
                      <input
                        aria-label={t('recipes.ingredientGrams')}
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={row.grams}
                        onChange={(e) =>
                          setRows(
                            rows.map((r, i) => (i === index ? { ...r, grams: e.target.value } : r)),
                          )
                        }
                        className="w-28 rounded-md border border-slate-300 py-2 pl-3 pr-8 text-right text-sm tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">
                        g
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRows(rows.filter((_, i) => i !== index))}
                      disabled={rows.length === 1}
                      aria-label={t('recipes.removeIngredient')}
                      title={t('recipes.removeIngredient')}
                      className="rounded-md px-2 py-1 text-sm text-slate-400 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-30"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setRows([...rows, { foodId: '', grams: '' }])}
                  className="ml-8 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-sm text-emerald-800 transition-colors hover:border-emerald-400 hover:bg-emerald-50"
                >
                  + {t('recipes.addIngredient')}
                </button>
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t('recipes.sectionNotes')}
              </legend>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="recipe-description" className="mb-1 block text-sm font-medium">
                    {t('recipes.description')}
                  </label>
                  <textarea
                    id="recipe-description"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label htmlFor="recipe-instructions" className="mb-1 block text-sm font-medium">
                    {t('recipes.instructions')}
                  </label>
                  <textarea
                    id="recipe-instructions"
                    rows={2}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </fieldset>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
            <p className="text-xs text-slate-500">
              {validRows.length > 0 && previewKcal > 0
                ? t('recipes.previewKcal', {
                    total: Math.round(previewKcal * 10) / 10,
                    perPortion:
                      previewPerPortion !== null ? Math.round(previewPerPortion * 10) / 10 : '—',
                  })
                : t('recipes.previewEmpty')}
            </p>
            <button
              type="submit"
              disabled={createMutation.isPending || !canSave}
              className="rounded-md bg-emerald-700 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
            >
              {createMutation.isPending ? t('recipes.saving') : t('recipes.save')}
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
            id="recipe-search"
            type="search"
            aria-label={t('recipes.searchLabel')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('recipes.searchPlaceholder')}
            className="w-full rounded-md border border-slate-300 py-2 pl-8 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        {recipesQuery.data && (
          <p className="text-xs text-slate-500">
            {t('recipes.count', { count: recipesQuery.data.length })}
          </p>
        )}
      </div>

      {recipesQuery.isLoading && <p className="text-sm text-slate-500">{t('recipes.loading')}</p>}
      {recipesQuery.isError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {t('recipes.loadError', { message: (recipesQuery.error as Error).message })}
        </div>
      )}
      {recipesQuery.data && recipesQuery.data.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-600">{t('recipes.empty')}</p>
          <p className="mt-1 text-xs text-slate-400">{t('recipes.emptyHint')}</p>
        </div>
      )}

      <div className="space-y-3">
        {recipesQuery.data?.map((recipe: RecipeDto) => {
          const kcal = macroOf(recipe.perPortion, 'energy_kcal');
          const protein = macroOf(recipe.perPortion, 'protein_g');
          const carbs = macroOf(recipe.perPortion, 'carbohydrate_g');
          const fat = macroOf(recipe.perPortion, 'fat_g');
          return (
            <article
              key={recipe.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-emerald-200"
            >
              <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-base font-semibold text-slate-800">{recipe.name}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {t('recipes.yieldBadge', { count: recipe.yieldPortions })}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">
                    {kcal?.amount ?? 0} kcal
                  </span>
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">
                    P {protein?.amount ?? 0} g
                  </span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                    H {carbs?.amount ?? 0} g
                  </span>
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800">
                    G {fat?.amount ?? 0} g
                  </span>
                  <span className="text-slate-400">{t('recipes.perPortionShort')}</span>
                  {recipe.perPortion.some((n) => !n.complete) && (
                    <span
                      className="rounded bg-amber-100 px-1 py-0.5 text-amber-800"
                      title={t('recipes.incompleteHint')}
                    >
                      ≥
                    </span>
                  )}
                </div>
              </header>
              {recipe.description && (
                <p className="mb-2 text-sm text-slate-600">{recipe.description}</p>
              )}
              <p className="text-xs text-slate-500">
                {recipe.ingredients.map((i) => `${i.foodName} ${i.grams} g`).join(' · ')}
              </p>
              {recipe.instructions && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-emerald-800 hover:underline">
                    {t('recipes.showInstructions')}
                  </summary>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                    {recipe.instructions}
                  </p>
                </details>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
