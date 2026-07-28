import { useEffect, useRef, useState } from 'react';

/**
 * Debounced autosave for an editor whose record already exists.
 *
 * Deliberately NOT used to create records: a brand-new consultation that the
 * practitioner abandons must not leave a draft behind, and drafts cannot be
 * deleted. It only keeps an existing draft up to date, which is the case where
 * an inactivity lock would otherwise throw away a paragraph of notes.
 *
 * `serialized` is the caller's comparable snapshot of the form; a save fires
 * once it has stopped changing for `delayMs` and differs from what was last
 * stored. Saves never overlap: while one is in flight the timer is not armed.
 */
export function useAutosave(options: {
  serialized: string;
  savedSnapshot: string;
  enabled: boolean;
  isSaving: boolean;
  onSave: () => void;
  delayMs?: number;
}): { pending: boolean; lastSavedAt: Date | null } {
  const { serialized, savedSnapshot, enabled, isSaving, onSave, delayMs = 3000 } = options;
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const dirty = enabled && serialized !== savedSnapshot;

  useEffect(() => {
    if (!dirty || isSaving) return;
    const timer = setTimeout(() => {
      onSaveRef.current();
      setLastSavedAt(new Date());
    }, delayMs);
    return () => clearTimeout(timer);
  }, [dirty, isSaving, serialized, delayMs]);

  return { pending: dirty, lastSavedAt };
}
