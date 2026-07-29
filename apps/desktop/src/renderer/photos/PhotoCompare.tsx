import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PhotoDto, PhotoKind } from '@ajnutrition/shared';
import { Modal } from '../components/Modal';
import { PhotoImage } from './PhotoImage';

/**
 * Side-by-side "antes / ahora" for one pose.
 *
 * Photos already exist and are already encrypted at rest; the value here is
 * purely in the comparison — it is what a patient responds to when the number
 * on the scale has barely moved. Only the same pose is ever compared: two
 * different angles side by side would read as a change that never happened.
 */

/** Oldest first per pose, so the pickers read chronologically. */
export function photosByKind(photos: readonly PhotoDto[]): Map<PhotoKind, PhotoDto[]> {
  const byKind = new Map<PhotoKind, PhotoDto[]>();
  for (const photo of photos) {
    const list = byKind.get(photo.kind) ?? [];
    list.push(photo);
    byKind.set(photo.kind, list);
  }
  for (const list of byKind.values()) {
    list.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  }
  return byKind;
}

/** Poses with at least two captures — anything else cannot be compared. */
export function comparableKinds(photos: readonly PhotoDto[]): PhotoKind[] {
  return [...photosByKind(photos).entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([kind]) => kind);
}

export function PhotoCompare({ photos, onClose }: { photos: PhotoDto[]; onClose: () => void }) {
  const { t } = useTranslation();
  const byKind = useMemo(() => photosByKind(photos), [photos]);
  const kinds = useMemo(() => comparableKinds(photos), [photos]);
  const [kind, setKind] = useState<PhotoKind>(() => kinds[0] ?? 'front');

  const list = byKind.get(kind) ?? [];
  const [leftId, setLeftId] = useState<string>(() => list[0]?.id ?? '');
  const [rightId, setRightId] = useState<string>(() => list.at(-1)?.id ?? '');

  const left = list.find((photo) => photo.id === leftId) ?? list[0];
  const right = list.find((photo) => photo.id === rightId) ?? list.at(-1);

  const pick = (value: string, side: 'left' | 'right') =>
    side === 'left' ? setLeftId(value) : setRightId(value);

  return (
    <Modal icon="📷" wide title={t('photos.compareTitle')} onClose={onClose}>
      {kinds.length === 0 ? (
        <p className="text-sm text-slate-500">{t('photos.compareNeedsTwo')}</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {kinds.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={option === kind}
                onClick={() => {
                  const next = byKind.get(option) ?? [];
                  setKind(option);
                  setLeftId(next[0]?.id ?? '');
                  setRightId(next.at(-1)?.id ?? '');
                }}
                className={
                  option === kind
                    ? 'rounded-full bg-emerald-700 px-3 py-1 text-xs font-medium text-white'
                    : 'rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100'
                }
              >
                {t(`photos.kinds.${option}`)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {(
              [
                ['left', left, t('photos.compareBefore')],
                ['right', right, t('photos.compareAfter')],
              ] as const
            ).map(([side, photo, label]) => (
              <div key={side}>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  {label}
                  <select
                    value={photo?.id ?? ''}
                    onChange={(e) => pick(e.target.value, side)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    {list.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.capturedAt}
                      </option>
                    ))}
                  </select>
                </label>
                {/* Both panes are the SAME fixed frame and the photo
                    letterboxes inside it: two captures rarely share an aspect
                    ratio, and panes of different heights make an unchanged
                    body look like it changed. The frame also reserves the
                    space before the bytes arrive, so nothing jumps. */}
                <div className="flex h-[58vh] items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                  {photo && (
                    <PhotoImage
                      photoId={photo.id}
                      alt={`${t(`photos.kinds.${photo.kind}`)} · ${photo.capturedAt}`}
                      className="max-h-full max-w-full object-contain"
                      placeholderClassName="h-full w-full animate-pulse bg-slate-200/70"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
