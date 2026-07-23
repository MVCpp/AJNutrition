import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { FoodDto, RecipeDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';

interface IngredientRow {
  foodId: string;
  grams: string;
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
          yieldPortions: Number(yieldPortions.replace(',', '.')),
          instructions: instructions.trim() || undefined,
          ingredients: rows
            .filter((row) => row.foodId !== '' && row.grams.trim() !== '')
            .map((row) => ({ foodId: row.foodId, grams: Number(row.grams.replace(',', '.')) })),
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

  return (
    <section aria-labelledby="recipes-heading">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 id="recipes-heading" className="text-lg font-semibold">
          {t('recipes.heading')}
        </h2>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
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
            <div className="sm:col-span-2">
              <label htmlFor="recipe-name" className="mb-1 block text-sm font-medium">
                {t('recipes.name')}
              </label>
              <input
                id="recipe-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="recipe-yield" className="mb-1 block text-sm font-medium">
                {t('recipes.yield')}
              </label>
              <input
                id="recipe-yield"
                type="text"
                inputMode="decimal"
                value={yieldPortions}
                onChange={(e) => setYieldPortions(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <h3 className="mb-2 text-xs font-medium uppercase text-slate-500">
            {t('recipes.ingredients')}
          </h3>
          <div className="mb-4 space-y-2">
            {rows.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  aria-label={t('recipes.ingredientFood')}
                  value={row.foodId}
                  onChange={(e) =>
                    setRows(
                      rows.map((r, i) => (i === index ? { ...r, foodId: e.target.value } : r)),
                    )
                  }
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  {foodsQuery.data?.map((food: FoodDto) => (
                    <option key={food.id} value={food.id}>
                      {food.name}
                      {food.brand ? ` (${food.brand})` : ''}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={t('recipes.ingredientGrams')}
                  type="text"
                  inputMode="decimal"
                  placeholder={t('recipes.ingredientGrams')}
                  value={row.grams}
                  onChange={(e) =>
                    setRows(rows.map((r, i) => (i === index ? { ...r, grams: e.target.value } : r)))
                  }
                  className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRows(rows.filter((_, i) => i !== index))}
                    className="text-xs text-red-700 underline-offset-2 hover:underline"
                  >
                    {t('recipes.removeIngredient')}
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setRows([...rows, { foodId: '', grams: '' }])}
              className="text-sm text-emerald-800 underline-offset-2 hover:underline"
            >
              {t('recipes.addIngredient')}
            </button>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="recipe-description" className="mb-1 block text-sm font-medium">
                {t('recipes.description')}
              </label>
              <textarea
                id="recipe-description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={createMutation.isPending || !canSave}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {createMutation.isPending ? t('recipes.saving') : t('recipes.save')}
          </button>
        </form>
      )}

      <div className="mb-4">
        <label htmlFor="recipe-search" className="mb-1 block text-sm font-medium text-slate-700">
          {t('recipes.searchLabel')}
        </label>
        <input
          id="recipe-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('recipes.searchPlaceholder')}
          className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
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
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {t('recipes.empty')}
        </div>
      )}

      <div className="space-y-4">
        {recipesQuery.data?.map((recipe: RecipeDto) => (
          <article key={recipe.id} className="rounded-lg border border-slate-200 bg-white p-5">
            <header className="mb-2 flex flex-wrap items-baseline gap-2">
              <h3 className="text-base font-semibold">{recipe.name}</h3>
              <span className="text-xs text-slate-500">
                {t('recipes.yield')}: {recipe.yieldPortions}
              </span>
            </header>
            {recipe.description && (
              <p className="mb-2 text-sm text-slate-600">{recipe.description}</p>
            )}
            <p className="mb-2 text-xs text-slate-500">
              {recipe.ingredients.map((i) => `${i.foodName} ${i.grams} g`).join(' · ')}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  ['totals', recipe.totals],
                  ['perPortion', recipe.perPortion],
                ] as const
              ).map(([labelKey, list]) => (
                <div key={labelKey}>
                  <h4 className="mb-1 text-xs font-medium uppercase text-slate-500">
                    {t(`recipes.${labelKey}`)}
                  </h4>
                  <p className="text-sm text-slate-700">
                    {list
                      .filter((n) => n.amount > 0 || !n.complete)
                      .map((n) => (
                        <span key={n.nutrientId} className="mr-3 inline-block">
                          {n.nameEs}: {n.amount} {n.unit}
                          {!n.complete && (
                            <span
                              className="ml-0.5 rounded bg-amber-100 px-1 text-xs text-amber-800"
                              title={t('recipes.incompleteHint')}
                            >
                              ≥
                            </span>
                          )}
                        </span>
                      ))}
                  </p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
