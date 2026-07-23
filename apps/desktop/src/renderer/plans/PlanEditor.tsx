import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { FoodDto, MealPlanDto, MealSlotDto, PhotoDto, RecipeDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';

const MACROS = ['energy_kcal', 'protein_g', 'carbohydrate_g', 'fat_g'] as const;

interface AddState {
  slot: MealSlotDto;
  mode: 'food' | 'recipe';
  refId: string;
  qty: string;
}

export function PlanEditor({ planId, onBack }: { planId: string; onBack: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [dayIndex, setDayIndex] = useState(0);
  const [photosDate, setPhotosDate] = useState<string>('');
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState<AddState | null>(null);

  const planQuery = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => unwrap(window.ajnutrition.plan.get({ planId })),
  });
  const foodsQuery = useQuery({
    queryKey: ['foods', ''],
    queryFn: () => unwrap(window.ajnutrition.food.search({})),
  });
  const recipesQuery = useQuery({
    queryKey: ['recipes', ''],
    queryFn: () => unwrap(window.ajnutrition.recipe.search({})),
  });

  const setPlan = (plan: MealPlanDto) => queryClient.setQueryData(['plan', planId], plan);

  const addMutation = useMutation({
    mutationFn: (state: AddState) =>
      unwrap(
        window.ajnutrition.plan.addItem({
          planId,
          dayIndex,
          mealSlot: state.slot,
          item:
            state.mode === 'food'
              ? { type: 'food', foodId: state.refId, grams: Number(state.qty.replace(',', '.')) }
              : {
                  type: 'recipe',
                  recipeId: state.refId,
                  portions: Number(state.qty.replace(',', '.')),
                },
        }),
      ),
    onSuccess: (plan) => {
      setPlan(plan);
      setAdding(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: string) => unwrap(window.ajnutrition.plan.removeItem({ itemId })),
    onSuccess: setPlan,
  });

  const patientId = planQuery.data?.patientId;
  const photosQuery = useQuery({
    queryKey: ['photos', patientId],
    queryFn: () => unwrap(window.ajnutrition.photo.list({ patientId: patientId ?? '' })),
    enabled: patientId !== undefined,
  });
  const photoDates = [...new Set((photosQuery.data ?? []).map((p: PhotoDto) => p.capturedAt))]
    .sort()
    .reverse();

  const exportMutation = useMutation({
    mutationFn: () =>
      unwrap(
        window.ajnutrition.plan.exportPdf({
          planId,
          includePhotosDate: photosDate === '' ? null : photosDate,
        }),
      ),
    onSuccess: (result) => {
      if (!result.canceled && result.fileName) {
        setExportMessage(t('plans.exported', { fileName: result.fileName }));
      }
    },
    onError: (err) => setExportMessage(err instanceof ApiError ? err.message : String(err)),
  });

  if (planQuery.isLoading || !planQuery.data) {
    return <p className="text-sm text-slate-500">{t('plans.loading')}</p>;
  }
  const plan = planQuery.data;
  const day = plan.dayPlans[dayIndex];

  const errorMessage =
    addMutation.error instanceof ApiError
      ? `${addMutation.error.message} (${addMutation.error.detail.supportCode})`
      : removeMutation.error instanceof ApiError
        ? removeMutation.error.message
        : null;

  const source = plan.targetSource;
  const provenance =
    source['type'] === 'measurement'
      ? t('plans.provenance', {
          ree: source['reeKcal'],
          formula: 'Mifflin-St Jeor',
          v: source['reeFormulaVersion'],
          pal: source['pal'],
          adj:
            Number(source['adjustmentKcal']) !== 0
              ? `${Number(source['adjustmentKcal']) > 0 ? '+' : ''}${source['adjustmentKcal']} kcal`
              : '',
          date: source['measuredAt'],
        })
      : t('plans.provenanceManual');

  const targetFor = (nutrientId: string): number | null => {
    if (nutrientId === 'energy_kcal') return plan.targets.energyKcal;
    if (nutrientId === 'protein_g') return plan.targets.proteinG;
    if (nutrientId === 'carbohydrate_g') return plan.targets.carbohydrateG;
    if (nutrientId === 'fat_g') return plan.targets.fatG;
    return null;
  };

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 text-sm text-slate-500 underline hover:text-slate-700"
      >
        {t('plans.back')}
      </button>

      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h3 className="text-lg font-semibold">{plan.name}</h3>
          <span className="text-xs text-slate-400">{provenance}</span>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="pdf-photos" className="text-xs text-slate-500">
            {t('plans.includePhotos')}
          </label>
          <select
            id="pdf-photos"
            value={photosDate}
            onChange={(e) => setPhotosDate(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            <option value="">{t('plans.noPhotos')}</option>
            {photoDates.map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setExportMessage(null);
              exportMutation.mutate();
            }}
            disabled={exportMutation.isPending}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {exportMutation.isPending ? t('plans.exporting') : t('plans.exportPdf')}
          </button>
        </div>
      </div>

      {exportMessage && (
        <p role="status" className="mb-2 text-xs text-slate-500">
          {exportMessage}
        </p>
      )}

      {plan.allergies.length > 0 && (
        <p
          role="alert"
          className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800"
        >
          {t('plans.allergies', { list: plan.allergies.join(' · ') })}
        </p>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800"
        >
          {errorMessage}
        </div>
      )}

      {plan.days > 1 && (
        <div className="mb-4 flex gap-1">
          {plan.dayPlans.map((d) => (
            <button
              key={d.dayIndex}
              type="button"
              onClick={() => setDayIndex(d.dayIndex)}
              className={
                d.dayIndex === dayIndex
                  ? 'rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800'
                  : 'rounded-md px-3 py-1.5 text-sm text-slate-500 hover:text-slate-800'
              }
            >
              {t('plans.day', { n: d.dayIndex + 1 })}
            </button>
          ))}
        </div>
      )}

      {/* Live day totals vs targets */}
      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <h4 className="mb-2 text-xs font-medium uppercase text-slate-500">
          {t('plans.dayTotals')}
        </h4>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          {MACROS.map((nutrientId) => {
            const total = day?.totals.find((n) => n.nutrientId === nutrientId);
            const target = targetFor(nutrientId);
            const value = total?.amount ?? 0;
            const pct = target ? Math.round((value / target) * 100) : null;
            return (
              <div key={nutrientId} className="text-sm">
                <span className="text-slate-500">{total?.nameEs}: </span>
                <span className="font-medium text-slate-800">
                  {target !== null
                    ? t('plans.ofTarget', { value, target })
                    : `${value} ${total?.unit ?? ''}`}
                </span>
                {pct !== null && (
                  <span
                    className={
                      pct >= 90 && pct <= 110
                        ? 'ml-1 text-xs text-emerald-700'
                        : 'ml-1 text-xs text-amber-700'
                    }
                  >
                    ({pct}%)
                  </span>
                )}
                {total && !total.complete && (
                  <span
                    className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800"
                    title={t('plans.incompleteHint')}
                  >
                    ≥
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        {day?.meals.map((meal) => (
          <section
            key={meal.slot}
            aria-label={t(`plans.slots.${meal.slot}`)}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-800">
                {t(`plans.slots.${meal.slot}`)}
              </h4>
              <span className="text-xs text-slate-500">
                {meal.totals.find((n) => n.nutrientId === 'energy_kcal')?.amount ?? 0} kcal
              </span>
            </div>

            <ul className="mb-2 space-y-1">
              {meal.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between text-sm">
                  <span>
                    {item.label}{' '}
                    <span className="text-xs text-slate-500">({item.quantityLabel})</span>
                    <span className="ml-2 text-xs text-slate-400">
                      {item.totals.find((n) => n.nutrientId === 'energy_kcal')?.amount ?? 0} kcal
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeMutation.mutate(item.id)}
                    disabled={removeMutation.isPending}
                    className="text-xs text-red-700 underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    {t('plans.remove')}
                  </button>
                </li>
              ))}
            </ul>

            {adding?.slot === meal.slot ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addMutation.mutate(adding);
                }}
                className="flex flex-wrap items-center gap-2"
              >
                <select
                  aria-label={adding.mode === 'food' ? t('app.navFoods') : t('app.navRecipes')}
                  value={adding.refId}
                  onChange={(e) => setAdding({ ...adding, refId: e.target.value })}
                  className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="">—</option>
                  {adding.mode === 'food'
                    ? foodsQuery.data?.map((food: FoodDto) => (
                        <option key={food.id} value={food.id}>
                          {food.name}
                        </option>
                      ))
                    : recipesQuery.data?.map((recipe: RecipeDto) => (
                        <option key={recipe.id} value={recipe.id}>
                          {recipe.name}
                        </option>
                      ))}
                </select>
                <input
                  aria-label={adding.mode === 'food' ? t('plans.grams') : t('plans.portions')}
                  type="text"
                  inputMode="decimal"
                  placeholder={adding.mode === 'food' ? t('plans.grams') : t('plans.portions')}
                  value={adding.qty}
                  onChange={(e) => setAdding({ ...adding, qty: e.target.value })}
                  className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="submit"
                  disabled={
                    addMutation.isPending || adding.refId === '' || adding.qty.trim() === ''
                  }
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {t('plans.add')}
                </button>
                <button
                  type="button"
                  onClick={() => setAdding(null)}
                  className="text-xs text-slate-500 underline-offset-2 hover:underline"
                >
                  {t('plans.cancel')}
                </button>
              </form>
            ) : (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setAdding({ slot: meal.slot, mode: 'food', refId: '', qty: '' })}
                  className="text-xs text-emerald-800 underline-offset-2 hover:underline"
                >
                  {t('plans.addFood')}
                </button>
                <button
                  type="button"
                  onClick={() => setAdding({ slot: meal.slot, mode: 'recipe', refId: '', qty: '' })}
                  className="text-xs text-emerald-800 underline-offset-2 hover:underline"
                >
                  {t('plans.addRecipe')}
                </button>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
