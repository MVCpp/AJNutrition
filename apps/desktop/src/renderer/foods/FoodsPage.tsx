import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AllergenId, FoodDto } from '@ajnutrition/shared';
import { ALLERGEN_IDS, ALLERGEN_LABELS } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';
import { paginate } from '../ui/paginate';
import { categoryChipClass } from './food-display';
import { FoodFormModal } from './FoodFormModal';

const PAGE_SIZE = 25;

const SOURCE_META = [
  ['custom', 'foods.srcMine'],
  ['import', 'foods.srcImport'],
  ['fdc', 'foods.srcFdc'],
  ['mx', 'foods.srcMx'],
] as const satisfies ReadonlyArray<readonly [FoodDto['source'], string]>;

const ALL_SOURCES = SOURCE_META.map(([id]) => id);

function nutrientOf(food: FoodDto, id: string): number | null {
  return food.nutrients.find((n) => n.nutrientId === id)?.amount ?? null;
}

export function FoodsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [enabledSources, setEnabledSources] =
    useState<ReadonlyArray<FoodDto['source']>>(ALL_SOURCES);
  const [taggingId, setTaggingId] = useState<string | null>(null);
  // undefined = closed · null = creating · FoodDto = editing that food
  const [editor, setEditor] = useState<FoodDto | null | undefined>(undefined);

  const foodsQuery = useQuery({
    queryKey: ['foods', search],
    queryFn: () => unwrap(window.ajnutrition.food.search(search ? { search } : {})),
  });

  const importMutation = useMutation({
    mutationFn: () => unwrap(window.ajnutrition.food.importCsv()),
    onSuccess: async (result) => {
      if (!result.canceled) await queryClient.invalidateQueries({ queryKey: ['foods'] });
    },
  });
  const importResult =
    importMutation.data && !importMutation.data.canceled ? importMutation.data : null;
  const importError =
    importMutation.error instanceof ApiError ? importMutation.error.message : null;

  const allergenMutation = useMutation({
    mutationFn: (input: { foodId: string; allergens: AllergenId[] }) =>
      unwrap(window.ajnutrition.food.setAllergens(input)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['foods'] });
    },
  });

  const foods = (foodsQuery.data ?? []).filter((food) => enabledSources.includes(food.source));
  const { totalPages, safePage, pageItems: pageFoods } = paginate(foods, page, PAGE_SIZE);

  return (
    <section aria-labelledby="foods-heading">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="foods-heading" className="text-lg font-semibold">
            {t('foods.heading')}
          </h2>
          <p className="text-sm text-slate-500">{t('foods.intro')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending}
            title={t('foods.importTitle')}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {importMutation.isPending ? t('foods.importing') : t('foods.import')}
          </button>
          <button
            type="button"
            onClick={() => setEditor(null)}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            {t('foods.new')}
          </button>
        </div>
      </div>

      {importError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {importError}
        </div>
      )}
      {importResult && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-medium">
            {t('foods.importDone', {
              imported: importResult.imported,
              skipped: importResult.skippedTotal,
            })}
          </p>
          {importResult.skipped.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-xs text-emerald-800">
              {importResult.skipped.map((s) => (
                <li key={s.line}>
                  {t('foods.importSkippedRow', { line: s.line, reason: s.reason })}
                </li>
              ))}
            </ul>
          )}
        </div>
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
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder={t('foods.searchPlaceholder')}
            className="w-full rounded-md border border-slate-300 py-2 pl-8 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label={t('foods.srcFilterLabel')}
        >
          <span className="text-xs text-slate-500">{t('foods.srcFilterLabel')}</span>
          {SOURCE_META.map(([id, labelKey]) => {
            const active = enabledSources.includes(id);
            const count = (foodsQuery.data ?? []).filter((f) => f.source === id).length;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setEnabledSources(
                    active ? enabledSources.filter((s) => s !== id) : [...enabledSources, id],
                  );
                  setPage(0);
                }}
                className={
                  active
                    ? 'flex items-center gap-1 rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-800'
                    : 'flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-500 transition-colors hover:border-emerald-300 hover:bg-emerald-50'
                }
              >
                <span aria-hidden="true">{active ? '☑' : '☐'}</span>
                {t(labelKey)}
                <span className={active ? 'text-emerald-100' : 'text-slate-400'}>({count})</span>
              </button>
            );
          })}
        </div>
        {foodsQuery.data && (
          <p className="text-xs text-slate-500">{t('foods.count', { count: foods.length })}</p>
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
      {foodsQuery.data && foodsQuery.data.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-600">{t('foods.empty')}</p>
          <p className="mt-1 text-xs text-slate-400">{t('foods.emptyHint')}</p>
        </div>
      )}

      {foodsQuery.data && foodsQuery.data.length > 0 && foods.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">
          {t('foods.filterEmpty')}
        </p>
      )}

      {foods.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 z-10 shadow-[0_1px_0_0_#e2e8f0]">
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
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
                  <th scope="col" className="px-3 py-3">
                    <span className="sr-only">{t('foods.colActions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageFoods.map((food: FoodDto) => (
                  <Fragment key={food.id}>
                    <tr className="transition-colors odd:bg-white even:bg-slate-50/40 hover:bg-emerald-50/40">
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-slate-800">{food.name}</span>
                          {food.source === 'fdc' && (
                            <span
                              className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500"
                              title={t('foods.fdcBadgeTitle')}
                            >
                              USDA
                            </span>
                          )}
                          {food.source === 'mx' && (
                            <span
                              className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200"
                              title={t('foods.mxBadgeTitle')}
                            >
                              MX
                            </span>
                          )}
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
                            <span
                              className={`rounded-full px-2 py-0.5 font-medium ${categoryChipClass(food.category)}`}
                            >
                              {food.category}
                            </span>
                          )}
                          {food.allergens.map((id) => (
                            <span
                              key={id}
                              className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-800"
                              title={t('foods.allergenTagTitle')}
                            >
                              ⛔ {ALLERGEN_LABELS[id as AllergenId] ?? id}
                            </span>
                          ))}
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
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        {food.source === 'custom' || food.source === 'import' ? (
                          <button
                            type="button"
                            onClick={() => setEditor(food)}
                            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-900"
                          >
                            {t('foods.edit')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            aria-expanded={taggingId === food.id}
                            onClick={() => setTaggingId(taggingId === food.id ? null : food.id)}
                            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-900"
                          >
                            {t('foods.tagAllergens')}
                          </button>
                        )}
                      </td>
                    </tr>
                    {taggingId === food.id && (
                      <tr className="bg-red-50/30">
                        <td colSpan={9} className="px-4 py-3">
                          <p className="mb-2 text-xs text-slate-600">
                            {t('foods.tagAllergensHint')}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {ALLERGEN_IDS.map((id) => {
                              const active = food.allergens.includes(id);
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  aria-pressed={active}
                                  disabled={allergenMutation.isPending}
                                  onClick={() =>
                                    allergenMutation.mutate({
                                      foodId: food.id,
                                      allergens: (active
                                        ? food.allergens.filter((a) => a !== id)
                                        : [...food.allergens, id]
                                      ).filter((a): a is AllergenId =>
                                        (ALLERGEN_IDS as readonly string[]).includes(a),
                                      ),
                                    })
                                  }
                                  className={
                                    active
                                      ? 'rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-50'
                                      : 'rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-red-300 hover:bg-red-50 disabled:opacity-50'
                                  }
                                >
                                  {ALLERGEN_LABELS[id]}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-2.5">
            <p className="text-xs tabular-nums text-slate-500">
              {t('foods.pageRange', {
                from: safePage * PAGE_SIZE + 1,
                to: Math.min(foods.length, (safePage + 1) * PAGE_SIZE),
                total: foods.length,
              })}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(0, safePage - 1))}
                disabled={safePage === 0}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40"
              >
                {t('foods.pagePrev')}
              </button>
              <span className="text-xs tabular-nums text-slate-500">
                {t('foods.pageInfo', { page: safePage + 1, pages: totalPages })}
              </span>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
                disabled={safePage >= totalPages - 1}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40"
              >
                {t('foods.pageNext')}
              </button>
            </div>
          </div>
        </div>
      )}
      {editor !== undefined && <FoodFormModal food={editor} onClose={() => setEditor(undefined)} />}
    </section>
  );
}
