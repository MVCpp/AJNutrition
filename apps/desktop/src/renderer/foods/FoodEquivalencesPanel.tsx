import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  EQUIVALENCE_GROUP_IDS,
  EQUIVALENCE_GROUP_LABELS,
  type EquivalenceGroupId,
  type FoodDto,
} from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';
import { parseQuantity } from '../ui/servings';

/**
 * SMAE equivalences for one food: "1 equivalente = N g".
 *
 * The app ships NO gram sizes and NO reference macros — they are clinical
 * reference data from the practitioner's own tables. A wrong gram size here
 * silently misstates a whole plan, so nothing is guessed or inferred; what is
 * shown is exactly what she typed.
 */
export function FoodEquivalencesPanel({ food }: { food: FoodDto }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [groupId, setGroupId] = useState<EquivalenceGroupId>('verduras');
  const [grams, setGrams] = useState('');

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['foods'] });

  const setMutation = useMutation({
    mutationFn: (input: { groupId: EquivalenceGroupId; gramsPerEquivalent: number }) =>
      unwrap(window.ajnutrition.food.setEquivalence({ foodId: food.id, ...input })),
    onSuccess: async () => {
      setGrams('');
      await refresh();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (group: EquivalenceGroupId) =>
      unwrap(window.ajnutrition.food.deleteEquivalence({ foodId: food.id, groupId: group })),
    onSuccess: refresh,
  });

  const parsed = parseQuantity(grams);
  const error =
    setMutation.error instanceof ApiError
      ? setMutation.error.message
      : deleteMutation.error instanceof ApiError
        ? deleteMutation.error.message
        : null;

  return (
    <div>
      <p className="mb-2 text-xs text-slate-600">{t('foods.equivalencesHint')}</p>

      {error && (
        <p role="alert" className="mb-2 rounded-md bg-red-50 p-2 text-xs text-red-800">
          {error}
        </p>
      )}

      {food.equivalences.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {food.equivalences.map((entry) => (
            <li
              key={entry.groupId}
              className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs"
            >
              <span>
                {EQUIVALENCE_GROUP_LABELS[entry.groupId as EquivalenceGroupId] ?? entry.groupId}: 1
                equiv. = {entry.gramsPerEquivalent} g
              </span>
              <button
                type="button"
                aria-label={t('foods.equivalenceDelete')}
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(entry.groupId as EquivalenceGroupId)}
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
          if (parsed === null) return;
          setMutation.mutate({ groupId, gramsPerEquivalent: parsed });
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <select
          aria-label={t('foods.equivalenceGroup')}
          value={groupId}
          onChange={(e) => setGroupId(e.target.value as EquivalenceGroupId)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          {EQUIVALENCE_GROUP_IDS.map((id) => (
            <option key={id} value={id}>
              {EQUIVALENCE_GROUP_LABELS[id]}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-400">1 equiv. =</span>
        <div className="relative w-28">
          <input
            aria-label={t('foods.equivalenceGrams')}
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
          disabled={parsed === null || setMutation.isPending}
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {t('foods.equivalenceSave')}
        </button>
      </form>
    </div>
  );
}
