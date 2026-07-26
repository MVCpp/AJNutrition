import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { FoodDto, RecipeDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';
import { Modal } from '../components/Modal';

/** Dedicated create/edit screen for a recipe (opens pre-filled when editing). */

interface IngredientRow {
  foodId: string;
  grams: string;
}

const num = (value: string) => Number(value.trim().replace(',', '.'));
const round1 = (value: number) => Math.round(value * 10) / 10;

export function RecipeFormModal({
  recipe,
  onClose,
}: {
  recipe: RecipeDto | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState(recipe?.name ?? '');
  const [description, setDescription] = useState(recipe?.description ?? '');
  const [yieldPortions, setYieldPortions] = useState(
    recipe === null ? '1' : String(recipe.yieldPortions),
  );
  const [instructions, setInstructions] = useState(recipe?.instructions ?? '');
  const [rows, setRows] = useState<IngredientRow[]>(
    recipe === null
      ? [{ foodId: '', grams: '' }]
      : recipe.ingredients.map((ingredient) => ({
          foodId: ingredient.foodId,
          grams: String(ingredient.grams),
        })),
  );

  // Full catalog for the ingredient selectors (native select type-ahead
  // handles the size; the backend returns every active food).
  const foodsQuery = useQuery({
    queryKey: ['foods', ''],
    queryFn: () => unwrap(window.ajnutrition.food.search({})),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        description: description.trim() || undefined,
        yieldPortions: num(yieldPortions),
        instructions: instructions.trim() || undefined,
        ingredients: rows
          .filter((row) => row.foodId !== '' && row.grams.trim() !== '')
          .map((row) => ({ foodId: row.foodId, grams: num(row.grams) })),
      };
      return recipe === null
        ? unwrap(window.ajnutrition.recipe.create(payload))
        : unwrap(window.ajnutrition.recipe.update({ ...payload, recipeId: recipe.id }));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['recipes'] });
      onClose();
    },
  });

  const errorMessage =
    saveMutation.error instanceof ApiError
      ? `${saveMutation.error.message} (${saveMutation.error.detail.supportCode})`
      : null;

  const validRows = rows.filter((row) => row.foodId !== '' && row.grams.trim() !== '');
  const canSave = name.trim() !== '' && validRows.length > 0 && yieldPortions.trim() !== '';

  // Live macro preview from the loaded catalog — display-only; the saved
  // totals are computed by the nutrition engine on the backend.
  const previewOf = (nutrientId: string) =>
    validRows.reduce((sum, row) => {
      const food = foodsQuery.data?.find((f: FoodDto) => f.id === row.foodId);
      const amount = food?.nutrients.find((n) => n.nutrientId === nutrientId)?.amount;
      if (food === undefined || amount === undefined) return sum;
      return sum + (amount * num(row.grams)) / food.basisGrams;
    }, 0);
  const previewKcal = previewOf('energy_kcal');
  const previewPortions = num(yieldPortions);
  const perPortionFactor =
    Number.isFinite(previewPortions) && previewPortions > 0 ? 1 / previewPortions : null;
  const previewChips =
    validRows.length > 0 && perPortionFactor !== null
      ? (
          [
            ['energy_kcal', 'kcal', 'bg-emerald-100 text-emerald-800'],
            ['protein_g', 'P', 'bg-sky-100 text-sky-800'],
            ['carbohydrate_g', 'H', 'bg-amber-100 text-amber-800'],
            ['fat_g', 'G', 'bg-rose-100 text-rose-800'],
          ] as const
        ).map(([nutrientId, label, color]) => ({
          nutrientId,
          label,
          color,
          total: round1(previewOf(nutrientId)),
          perPortion: round1(previewOf(nutrientId) * perPortionFactor),
        }))
      : [];

  return (
    <Modal
      icon="🍲"
      wide
      title={
        recipe === null
          ? t('recipes.formTitle')
          : t('recipes.editModalTitle', { name: recipe.name })
      }
      subtitle={t('recipes.formHint')}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          {previewChips.length > 0 && previewKcal > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-slate-600">{t('recipes.previewPerPortion')}</span>
              {previewChips.map((chip) => (
                <span
                  key={chip.nutrientId}
                  className={`rounded-full px-2 py-0.5 font-medium tabular-nums ${chip.color}`}
                  title={t('recipes.previewTotalTitle', { total: chip.total })}
                >
                  {chip.nutrientId === 'energy_kcal'
                    ? `${chip.perPortion} kcal`
                    : `${chip.label} ${chip.perPortion} g`}
                </span>
              ))}
              <span className="text-slate-400">
                {t('recipes.previewTotal', { total: round1(previewKcal) })}
              </span>
            </div>
          ) : (
            <p className="text-xs text-slate-500">{t('recipes.previewEmpty')}</p>
          )}
          <button
            type="submit"
            form="recipe-form-modal"
            disabled={saveMutation.isPending || !canSave}
            className="rounded-md bg-emerald-700 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
          >
            {saveMutation.isPending
              ? t('recipes.saving')
              : recipe === null
                ? t('recipes.save')
                : t('recipes.saveChanges')}
          </button>
        </div>
      }
    >
      <form
        id="recipe-form-modal"
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
      </form>
    </Modal>
  );
}
