import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { RecipeDto } from '@ajnutrition/shared';
import { unwrap } from '../api';
import { RecipeFormModal } from './RecipeFormModal';

function macroOf(list: RecipeDto['perPortion'], id: string) {
  return list.find((n) => n.nutrientId === id);
}

export function RecipesPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const queryClient = useQueryClient();
  // undefined = closed · null = creating · RecipeDto = editing that recipe
  const [editor, setEditor] = useState<RecipeDto | null | undefined>(undefined);

  const recipesQuery = useQuery({
    queryKey: ['recipes', search, includeArchived],
    queryFn: () =>
      unwrap(
        window.ajnutrition.recipe.search({
          ...(search ? { search } : {}),
          ...(includeArchived ? { includeArchived: true } : {}),
        }),
      ),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { recipeId: string; status: 'active' | 'archived' }) =>
      unwrap(window.ajnutrition.recipe.setStatus(input)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
  });

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
          onClick={() => setEditor(null)}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800"
        >
          {t('recipes.new')}
        </button>
      </div>

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
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500"
            />
            {t('recipes.includeArchived')}
          </label>
          {recipesQuery.data && (
            <p className="text-xs text-slate-500">
              {t('recipes.count', { count: recipesQuery.data.length })}
            </p>
          )}
        </div>
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
      {recipesQuery.data && recipesQuery.data.length === 0 && (
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
                  <button
                    type="button"
                    onClick={() =>
                      statusMutation.mutate({
                        recipeId: recipe.id,
                        status: recipe.status === 'archived' ? 'active' : 'archived',
                      })
                    }
                    disabled={statusMutation.isPending}
                    className="ml-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {recipe.status === 'archived' ? t('recipes.restore') : t('recipes.archive')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditor(recipe)}
                    className="ml-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-900"
                  >
                    {t('recipes.edit')}
                  </button>
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
      {editor !== undefined && (
        <RecipeFormModal recipe={editor} onClose={() => setEditor(undefined)} />
      )}
    </section>
  );
}
