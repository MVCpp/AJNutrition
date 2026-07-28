import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * App-wide "there is typing that has not been stored yet" signal.
 *
 * Why it exists: locking closes the encrypted database and unmounts the whole
 * authenticated UI, so anything still only in a React state variable is gone.
 * The lock is a security control and is NEVER blocked or delayed — the moment
 * an inactivity lock fires is precisely the moment the practitioner walked
 * away from an open record, and an unattended open record is worse than a lost
 * paragraph. So instead of preventing it, the app warns before a MANUAL lock
 * (a deliberate action, where asking is fair), shows a standing indicator, and
 * autosaves drafts so there is usually nothing left to lose.
 */

interface UnsavedContextValue {
  count: number;
  setDirty: (id: string, dirty: boolean) => void;
}

const UnsavedContext = createContext<UnsavedContextValue | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());

  // Stable across renders: editors register on every keystroke and must not
  // re-subscribe each time.
  const setDirty = useCallback((id: string, dirty: boolean) => {
    setIds((current) => {
      if (current.has(id) === dirty) return current;
      const next = new Set(current);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const value = useMemo<UnsavedContextValue>(
    () => ({ count: ids.size, setDirty }),
    [ids, setDirty],
  );

  return <UnsavedContext.Provider value={value}>{children}</UnsavedContext.Provider>;
}

/** Registers this editor as dirty/clean; unregisters automatically on unmount. */
export function useUnsavedFlag(id: string, dirty: boolean): void {
  const setDirty = useContext(UnsavedContext)?.setDirty;
  useEffect(() => {
    if (setDirty === undefined) return;
    setDirty(id, dirty);
    return () => setDirty(id, false);
  }, [id, dirty, setDirty]);
}

export function useHasUnsavedChanges(): boolean {
  return (useContext(UnsavedContext)?.count ?? 0) > 0;
}
