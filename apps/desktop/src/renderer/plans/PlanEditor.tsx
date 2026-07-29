import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ALLERGEN_LABELS,
  REE_FORMULA_LABELS,
  type AllergenId,
  type FoodDto,
  type MealPlanDto,
  type MealSlotDto,
  type PhotoDto,
  type RecipeDto,
  type ShoppingListDto,
} from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';
import { Modal } from '../components/Modal';
import { planDayToText } from './plan-text';
import { parseQuantity, resolveGrams, servingOptionLabel } from '../ui/servings';

const MACROS = ['energy_kcal', 'protein_g', 'carbohydrate_g', 'fat_g'] as const;

interface AddState {
  slot: MealSlotDto;
  mode: 'food' | 'recipe';
  refId: string;
  qty: string;
  /** Household measure the quantity is expressed in; '' = grams. */
  servingId: string;
}

export function PlanEditor({ planId, onBack }: { planId: string; onBack: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [dayIndex, setDayIndex] = useState(0);
  const [photosDate, setPhotosDate] = useState<string>('');
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState<AddState | null>(null);
  const [substituting, setSubstituting] = useState<string | null>(null);
  const [copyTarget, setCopyTarget] = useState<string>('');
  const [shoppingList, setShoppingList] = useState<ShoppingListDto | null>(null);
  const [copied, setCopied] = useState(false);
  const [dayCopied, setDayCopied] = useState(false);
  const [duplicating, setDuplicating] = useState<{ name: string; patientId: string } | null>(null);
  const [distribution, setDistribution] = useState<MealPlanDto['mealDistribution']>(null);

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

  const servingsOf = (foodId: string) =>
    foodsQuery.data?.find((food: FoodDto) => food.id === foodId)?.servings ?? [];

  const addMutation = useMutation({
    mutationFn: (state: AddState) =>
      unwrap(
        window.ajnutrition.plan.addItem({
          planId,
          dayIndex,
          mealSlot: state.slot,
          item:
            state.mode === 'food'
              ? state.servingId !== ''
                ? {
                    // Main resolves the measure and computes the grams, so the
                    // stored label can never disagree with the amount.
                    type: 'food',
                    foodId: state.refId,
                    serving: {
                      servingId: state.servingId,
                      quantity: parseQuantity(state.qty) ?? 0,
                    },
                  }
                : {
                    type: 'food',
                    foodId: state.refId,
                    grams: parseQuantity(state.qty) ?? 0,
                  }
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

  const substitutesQuery = useQuery({
    queryKey: ['substitutes', substituting],
    queryFn: () => unwrap(window.ajnutrition.plan.substitutes({ itemId: substituting ?? '' })),
    enabled: substituting !== null,
  });
  const replaceMutation = useMutation({
    mutationFn: (command: { itemId: string; foodId: string; grams: number }) =>
      unwrap(window.ajnutrition.plan.replaceItem(command)),
    onSuccess: (updated) => {
      setPlan(updated);
      setSubstituting(null);
    },
  });

  const patientId = planQuery.data?.patientId;
  // Live structured allergy tags — used to gray out conflicting catalog
  // entries up front; the main process enforces the same block regardless.
  const historyQuery = useQuery({
    queryKey: ['history', patientId, false],
    queryFn: () => unwrap(window.ajnutrition.history.list({ patientId: patientId ?? '' })),
    enabled: patientId !== undefined,
  });
  const patientAllergens = new Set(
    (historyQuery.data ?? [])
      .filter((e) => (e.category === 'allergy' || e.category === 'intolerance') && e.allergenId)
      .map((e) => e.allergenId as string),
  );
  const foodBlockLabel = (allergens: readonly string[]): string | null => {
    const hits = allergens.filter((id) => patientAllergens.has(id));
    if (hits.length === 0) return null;
    return hits.map((id) => ALLERGEN_LABELS[id as AllergenId] ?? id).join(', ');
  };
  const allergensByFoodId = new Map(
    (foodsQuery.data ?? []).map((food: FoodDto) => [food.id, food.allergens]),
  );
  const recipeBlockLabel = (recipe: RecipeDto): string | null =>
    foodBlockLabel(recipe.ingredients.flatMap((ing) => allergensByFoodId.get(ing.foodId) ?? []));

  const photosQuery = useQuery({
    queryKey: ['photos', patientId],
    queryFn: () => unwrap(window.ajnutrition.photo.list({ patientId: patientId ?? '' })),
    enabled: patientId !== undefined,
  });
  const photoDates = [...new Set((photosQuery.data ?? []).map((p: PhotoDto) => p.capturedAt))]
    .sort()
    .reverse();

  // Only loaded when the duplicate dialog opens: the picker is the only place
  // this screen needs the patient list.
  const patientsQuery = useQuery({
    queryKey: ['patients', '', false],
    queryFn: () => unwrap(window.ajnutrition.patient.list({})),
    enabled: duplicating !== null,
  });

  const duplicateMutation = useMutation({
    mutationFn: (input: { name: string; patientId: string }) =>
      unwrap(
        window.ajnutrition.plan.duplicate({
          planId,
          name: input.name,
          ...(input.patientId === plan.patientId ? {} : { targetPatientId: input.patientId }),
        }),
      ),
    onSuccess: (created) => {
      setDuplicating(null);
      void queryClient.invalidateQueries({ queryKey: ['plans'] });
      // Land in the copy: duplicating is always followed by editing it.
      if (created.patientId === plan.patientId) setPlan(created);
    },
  });

  const distributionMutation = useMutation({
    mutationFn: (value: MealPlanDto['mealDistribution']) =>
      unwrap(window.ajnutrition.plan.setMealDistribution({ planId, distribution: value })),
    onSuccess: (updated) => {
      setPlan(updated);
      setDistribution(null);
    },
  });

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

  const statusMutation = useMutation({
    mutationFn: (status: 'active' | 'archived') =>
      unwrap(window.ajnutrition.plan.setStatus({ planId, status })),
    onSuccess: (updated) => {
      setPlan(updated);
      void queryClient.invalidateQueries({ queryKey: ['plans'] });
    },
  });

  const shoppingMutation = useMutation({
    mutationFn: () => unwrap(window.ajnutrition.plan.shoppingList({ planId })),
    onSuccess: setShoppingList,
  });

  const copyMutation = useMutation({
    mutationFn: (toDayIndex: number) =>
      unwrap(window.ajnutrition.plan.copyDay({ planId, fromDayIndex: dayIndex, toDayIndex })),
    onSuccess: (updated) => {
      setPlan(updated);
      setCopyTarget('');
    },
  });

  if (planQuery.isLoading || !planQuery.data) {
    return <p className="text-sm text-slate-500">{t('plans.loading')}</p>;
  }
  const plan = planQuery.data;
  const day = plan.dayPlans[dayIndex];

  const isDraft = plan.status === 'draft';
  const isEditable = plan.status !== 'archived';

  const errorMessage =
    addMutation.error instanceof ApiError
      ? `${addMutation.error.message} (${addMutation.error.detail.supportCode})`
      : removeMutation.error instanceof ApiError
        ? removeMutation.error.message
        : replaceMutation.error instanceof ApiError
          ? replaceMutation.error.message
          : statusMutation.error instanceof ApiError
            ? statusMutation.error.message
            : copyMutation.error instanceof ApiError
              ? copyMutation.error.message
              : null;

  const source = plan.targetSource;
  const provenance =
    source['type'] === 'measurement'
      ? t('plans.provenance', {
          ree: source['reeKcal'],
          formula:
            REE_FORMULA_LABELS[source['reeFormulaId'] as keyof typeof REE_FORMULA_LABELS] ??
            String(source['reeFormulaId']),
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
          <span
            className={
              plan.status === 'active'
                ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800'
                : plan.status === 'archived'
                  ? 'rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600'
                  : 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800'
            }
          >
            {t(`plans.status.${plan.status}`)}
          </span>
          {isDraft && (
            <button
              type="button"
              onClick={() => statusMutation.mutate('active')}
              disabled={statusMutation.isPending}
              className="text-xs text-emerald-800 underline-offset-2 hover:underline disabled:opacity-50"
            >
              {t('plans.activate')}
            </button>
          )}
          {plan.status !== 'archived' && (
            <button
              type="button"
              onClick={() => statusMutation.mutate('archived')}
              disabled={statusMutation.isPending}
              className="text-xs text-slate-500 underline-offset-2 hover:underline disabled:opacity-50"
            >
              {t('plans.archive')}
            </button>
          )}
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
          {/* How a patient actually receives the plan day to day: plain text
              for WhatsApp, built from the exact strings shown on screen. */}
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(planDayToText(plan, dayIndex)).then(() => {
                setDayCopied(true);
                setTimeout(() => setDayCopied(false), 2500);
              });
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
          >
            {dayCopied ? t('plans.dayCopied') : t('plans.copyDayText')}
          </button>
          <button
            type="button"
            onClick={() =>
              setDuplicating({ name: `${plan.name} (copia)`, patientId: plan.patientId })
            }
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
          >
            {t('plans.duplicate')}
          </button>
          <button
            type="button"
            onClick={() =>
              setDistribution(
                plan.mealDistribution ?? {
                  breakfast: 25,
                  snack1: 10,
                  lunch: 30,
                  snack2: 10,
                  dinner: 25,
                },
              )
            }
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
          >
            {t('plans.distribution')}
          </button>
          {distribution !== null && (
            <Modal icon="🍽" title={t('plans.distribution')} onClose={() => setDistribution(null)}>
              <p className="mb-3 text-sm text-slate-600">{t('plans.distributionHint')}</p>
              <div className="space-y-2">
                {(['breakfast', 'snack1', 'lunch', 'snack2', 'dinner'] as const).map((slot) => (
                  <div key={slot} className="flex items-center justify-between gap-3">
                    <label htmlFor={`dist-${slot}`} className="text-sm">
                      {t(`plans.slots.${slot}`)}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id={`dist-${slot}`}
                        type="text"
                        inputMode="decimal"
                        value={String(distribution[slot])}
                        onChange={(e) =>
                          setDistribution({
                            ...distribution,
                            [slot]: Number(e.target.value.replace(',', '.')) || 0,
                          })
                        }
                        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm tabular-nums"
                      />
                      <span className="text-xs text-slate-400">%</span>
                      <span className="w-20 text-right text-xs text-slate-500">
                        {Math.round((plan.targets.energyKcal * distribution[slot]) / 100)} kcal
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm font-medium">
                {t('plans.distributionTotal', {
                  total: Math.round(
                    Object.values(distribution).reduce((sum, value) => sum + value, 0),
                  ),
                })}
              </p>
              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => distributionMutation.mutate(distribution)}
                  disabled={
                    Math.abs(
                      Object.values(distribution).reduce((sum, value) => sum + value, 0) - 100,
                    ) >= 0.5 || distributionMutation.isPending
                  }
                  className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {t('plans.save')}
                </button>
                <button
                  type="button"
                  onClick={() => distributionMutation.mutate(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                >
                  {t('plans.distributionClear')}
                </button>
              </div>
            </Modal>
          )}
          {duplicating !== null && (
            <Modal icon="🍽" title={t('plans.duplicate')} onClose={() => setDuplicating(null)}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  duplicateMutation.mutate(duplicating);
                }}
              >
                <label className="mb-1 block text-sm font-medium" htmlFor="duplicate-name">
                  {t('plans.name')}
                </label>
                <input
                  id="duplicate-name"
                  value={duplicating.name}
                  onChange={(e) => setDuplicating({ ...duplicating, name: e.target.value })}
                  className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />

                <label className="mb-1 block text-sm font-medium" htmlFor="duplicate-patient">
                  {t('plans.duplicatePatient')}
                </label>
                <select
                  id="duplicate-patient"
                  value={duplicating.patientId}
                  onChange={(e) => setDuplicating({ ...duplicating, patientId: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {(patientsQuery.data ?? []).map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.lastName}, {candidate.firstName}
                    </option>
                  ))}
                </select>
                {duplicating.patientId !== plan.patientId && (
                  <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                    {t('plans.duplicateOtherPatientWarning')}
                  </p>
                )}

                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={duplicating.name.trim() === '' || duplicateMutation.isPending}
                    className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {duplicateMutation.isPending ? t('plans.duplicating') : t('plans.duplicate')}
                  </button>
                  {duplicateMutation.error instanceof ApiError && (
                    <span className="text-xs text-red-700">{duplicateMutation.error.message}</span>
                  )}
                </div>
              </form>
            </Modal>
          )}
          <button
            type="button"
            onClick={() => {
              if (shoppingList !== null) {
                setShoppingList(null);
              } else {
                shoppingMutation.mutate();
              }
            }}
            disabled={shoppingMutation.isPending}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {t('plans.shoppingList')}
          </button>
        </div>
      </div>

      {exportMessage && (
        <p role="status" className="mb-2 text-xs text-slate-500">
          {exportMessage}
        </p>
      )}

      {shoppingList !== null && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-800">
              {t('plans.shoppingHeading', { days: shoppingList.days })}
            </h4>
            <button
              type="button"
              onClick={() => {
                const text = shoppingList.items
                  .map(
                    (item) =>
                      `${item.foodName}${item.brand ? ` (${item.brand})` : ''}: ${item.totalGrams} g`,
                  )
                  .join('\n');
                void navigator.clipboard
                  .writeText(`${shoppingList.planName}\n${text}`)
                  .then(() => setCopied(true));
              }}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
            >
              {copied ? t('plans.shoppingCopied') : t('plans.shoppingCopy')}
            </button>
          </div>
          {shoppingList.items.length === 0 ? (
            <p className="text-sm text-slate-500">{t('plans.shoppingEmpty')}</p>
          ) : (
            <ul className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
              {shoppingList.items.map((item) => (
                <li
                  key={item.foodId}
                  className="flex items-baseline justify-between border-b border-dotted border-slate-200 py-1 text-sm"
                >
                  <span className="text-slate-700">
                    {item.foodName}
                    {item.brand && (
                      <span className="ml-1 text-xs text-slate-400">{item.brand}</span>
                    )}
                  </span>
                  <span className="font-medium tabular-nums text-slate-800">
                    {item.totalGrams} g
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(plan.allergies.length > 0 || patientAllergens.size > 0) && (
        <div
          role="alert"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800"
        >
          {plan.allergies.length > 0 && (
            <span>{t('plans.allergies', { list: plan.allergies.join(' · ') })}</span>
          )}
          {[...patientAllergens].map((id) => (
            <span
              key={id}
              className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white"
              title={t('plans.blockedChipTitle')}
            >
              ⛔ {ALLERGEN_LABELS[id as AllergenId] ?? id}
            </span>
          ))}
        </div>
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
        <div className="mb-4 flex items-center gap-1">
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
          {isEditable && (
            <span className="ml-auto flex items-center gap-1">
              <label htmlFor="copy-day" className="text-xs text-slate-500">
                {t('plans.copyDayTo')}
              </label>
              <select
                id="copy-day"
                value={copyTarget}
                onChange={(e) => setCopyTarget(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                <option value="">—</option>
                {plan.dayPlans
                  .filter((d) => d.dayIndex !== dayIndex)
                  .map((d) => (
                    <option key={d.dayIndex} value={String(d.dayIndex)}>
                      {t('plans.day', { n: d.dayIndex + 1 })}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={() => copyMutation.mutate(Number(copyTarget))}
                disabled={copyTarget === '' || copyMutation.isPending}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                {t('plans.copy')}
              </button>
            </span>
          )}
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
            const chipColor =
              nutrientId === 'energy_kcal'
                ? 'border-emerald-200 bg-emerald-50'
                : nutrientId === 'protein_g'
                  ? 'border-sky-200 bg-sky-50'
                  : nutrientId === 'carbohydrate_g'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-rose-200 bg-rose-50';
            return (
              <div
                key={nutrientId}
                className={`rounded-lg border px-3 py-1.5 text-sm ${chipColor}`}
              >
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
                {meal.targetKcal !== null && (
                  <>
                    {' '}
                    <span
                      className={
                        // Within 15 % of the slot's target reads as on plan;
                        // the number is guidance, not a rule, so it never blocks.
                        Math.abs(
                          (meal.totals.find((n) => n.nutrientId === 'energy_kcal')?.amount ?? 0) -
                            meal.targetKcal,
                        ) <=
                        meal.targetKcal * 0.15
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }
                    >
                      / {meal.targetKcal} kcal
                    </span>
                  </>
                )}
              </span>
            </div>

            <ul className="mb-2 space-y-1">
              {meal.items.map((item) => (
                <li key={item.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span>
                      {item.label}{' '}
                      <span className="text-xs text-slate-500">({item.quantityLabel})</span>
                      <span className="ml-2 text-xs text-slate-400">
                        {item.totals.find((n) => n.nutrientId === 'energy_kcal')?.amount ?? 0} kcal
                      </span>
                    </span>
                    {isEditable && (
                      <span className="flex items-center gap-3">
                        {item.itemType === 'food' && (
                          <button
                            type="button"
                            onClick={() =>
                              setSubstituting(substituting === item.id ? null : item.id)
                            }
                            className="text-xs text-emerald-800 underline-offset-2 hover:underline"
                          >
                            ⇄ {t('plans.substitute')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeMutation.mutate(item.id)}
                          disabled={removeMutation.isPending}
                          className="text-xs text-red-700 underline-offset-2 hover:underline disabled:opacity-50"
                        >
                          {t('plans.remove')}
                        </button>
                      </span>
                    )}
                  </div>
                  {substituting === item.id && (
                    <div className="mb-1 mt-1.5 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                      {substitutesQuery.isLoading && (
                        <p className="text-xs text-slate-500">{t('plans.substituteLoading')}</p>
                      )}
                      {substitutesQuery.isError && (
                        <p className="text-xs text-red-700">
                          {(substitutesQuery.error as Error).message}
                        </p>
                      )}
                      {substitutesQuery.data && (
                        <>
                          <p className="mb-2 text-xs text-slate-600">
                            {t('plans.substituteFor', {
                              name: substitutesQuery.data.original.name,
                              grams: substitutesQuery.data.original.grams,
                              kcal: substitutesQuery.data.original.energyKcal,
                            })}
                          </p>
                          {substitutesQuery.data.suggestions.length === 0 && (
                            <p className="text-xs text-slate-500">{t('plans.substituteNone')}</p>
                          )}
                          <ul className="space-y-1">
                            {substitutesQuery.data.suggestions.map((s) => (
                              <li
                                key={s.foodId}
                                className="flex flex-wrap items-center gap-2 rounded-md bg-white px-2.5 py-1.5 ring-1 ring-slate-200"
                              >
                                <span className="font-medium text-slate-800">{s.name}</span>
                                <span className="text-xs tabular-nums text-slate-500">
                                  {s.grams} g
                                </span>
                                <span className="ml-auto flex items-center gap-1.5 text-xs tabular-nums">
                                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-emerald-800">
                                    {s.energyKcal} kcal
                                  </span>
                                  <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-sky-800">
                                    P {s.proteinG}
                                  </span>
                                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-800">
                                    H {s.carbohydrateG}
                                  </span>
                                  <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-rose-800">
                                    G {s.fatG}
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  disabled={replaceMutation.isPending}
                                  onClick={() =>
                                    replaceMutation.mutate({
                                      itemId: item.id,
                                      foodId: s.foodId,
                                      grams: s.grams,
                                    })
                                  }
                                  className="rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                                >
                                  {t('plans.substituteUse')}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {!isEditable ? null : adding?.slot === meal.slot ? (
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
                  onChange={(e) => setAdding({ ...adding, refId: e.target.value, servingId: '' })}
                  className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="">—</option>
                  {adding.mode === 'food'
                    ? foodsQuery.data?.map((food: FoodDto) => {
                        const blocked = foodBlockLabel(food.allergens);
                        return (
                          <option key={food.id} value={food.id} disabled={blocked !== null}>
                            {blocked === null
                              ? food.name
                              : t('plans.blockedOption', { name: food.name, list: blocked })}
                          </option>
                        );
                      })
                    : recipesQuery.data?.map((recipe: RecipeDto) => {
                        const blocked = recipeBlockLabel(recipe);
                        return (
                          <option key={recipe.id} value={recipe.id} disabled={blocked !== null}>
                            {blocked === null
                              ? recipe.name
                              : t('plans.blockedOption', { name: recipe.name, list: blocked })}
                          </option>
                        );
                      })}
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
                {adding.mode === 'food' && servingsOf(adding.refId).length > 0 && (
                  <>
                    <select
                      aria-label={t('plans.unit')}
                      value={adding.servingId}
                      onChange={(e) => setAdding({ ...adding, servingId: e.target.value })}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">{t('plans.unitGrams')}</option>
                      {servingsOf(adding.refId).map((serving) => (
                        <option key={serving.id} value={serving.id}>
                          {servingOptionLabel(serving)}
                        </option>
                      ))}
                    </select>
                    {adding.servingId !== '' && (
                      <span className="text-xs text-slate-500">
                        ={' '}
                        {t('plans.equalsGrams', {
                          grams:
                            resolveGrams(adding.qty, adding.servingId, servingsOf(adding.refId)) ??
                            0,
                        })}
                      </span>
                    )}
                  </>
                )}
                <button
                  type="submit"
                  disabled={
                    addMutation.isPending ||
                    adding.refId === '' ||
                    (adding.mode === 'food'
                      ? resolveGrams(adding.qty, adding.servingId, servingsOf(adding.refId)) ===
                        null
                      : adding.qty.trim() === '')
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
                  onClick={() =>
                    setAdding({ slot: meal.slot, mode: 'food', refId: '', qty: '', servingId: '' })
                  }
                  className="text-xs text-emerald-800 underline-offset-2 hover:underline"
                >
                  {t('plans.addFood')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setAdding({
                      slot: meal.slot,
                      mode: 'recipe',
                      refId: '',
                      qty: '',
                      servingId: '',
                    })
                  }
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
