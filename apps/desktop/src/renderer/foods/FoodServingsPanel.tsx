import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { FoodDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';
import { parseQuantity } from '../ui/servings';

/**
 * Household measures for one food ("1 pieza = 30 g", "1 taza = 240 g").
 *
 * Offered for EVERY food, including the read-only USDA/México catalog rows:
 * a measure is the practitioner's own metadata, not source data, and it is on
 * exactly those catalog foods (tortilla, bolillo) that typing grams by hand
 * hurts most. Same reasoning as allergen tags.
 */
export function FoodServingsPanel({ food }: { food: FoodDto }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [grams, setGrams] = useState('');

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['foods'] });

  const addMutation = useMutation({
    mutationFn: (input: { name: string; grams: number }) =>
      unwrap(window.ajnutrition.food.addServing({ foodId: food.id, ...input })),
    onSuccess: async () => {
      setName('');
      setGrams('');
      await refresh();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (servingId: string) => unwrap(window.ajnutrition.food.deleteServing({ servingId })),
    onSuccess: refresh,
  });

  const parsedGrams = parseQuantity(grams);
  const canAdd = name.trim() !== '' && parsedGrams !== null && !addMutation.isPending;
  const error =
    addMutation.error instanceof ApiError
      ? addMutation.error.message
      : deleteMutation.error instanceof ApiError
        ? deleteMutation.error.message
        : null;

  return (
    <div>
      <p className="mb-2 text-xs text-slate-600">{t('foods.servingsHint')}</p>

      {error && (
        <p role="alert" className="mb-2 rounded-md bg-red-50 p-2 text-xs text-red-800">
          {error}
        </p>
      )}

      {food.servings.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {food.servings.map((serving) => (
            <li
              key={serving.id}
              className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs"
            >
              <span>
                {serving.name} = {serving.grams} g
              </span>
              <button
                type="button"
                aria-label={t('foods.servingDelete', { name: serving.name })}
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(serving.id)}
                className="text-slate-400 hover:text-red-700 disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (parsedGrams === null) return;
          addMutation.mutate({ name: name.trim(), grams: parsedGrams });
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          aria-label={t('foods.servingName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('foods.servingNamePlaceholder')}
          className="w-48 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <span className="text-xs text-slate-400">=</span>
        <div className="relative w-28">
          <input
            aria-label={t('foods.servingGrams')}
            type="text"
            inputMode="decimal"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            className="w-full rounded-md border border-slate-300 py-1.5 pl-2 pr-7 text-right text-sm tabular-nums"
          />
          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-slate-400">
            g
          </span>
        </div>
        <button
          type="submit"
          disabled={!canAdd}
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {t('foods.servingAdd')}
        </button>
      </form>
    </div>
  );
}
