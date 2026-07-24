import { useEffect, type ReactNode } from 'react';

/**
 * Centered dialog over a dimmed, blurred backdrop. Closes on Escape,
 * backdrop click, or the ✕ button. Content scrolls internally.
 */
export function Modal({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: string | undefined;
  icon?: string | undefined;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="ajn-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`ajn-dialog flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5 ${
          wide ? 'max-w-3xl' : 'max-w-xl'
        }`}
      >
        <div className="h-1 shrink-0 bg-gradient-to-r from-emerald-600 to-emerald-400" />
        <div className="flex shrink-0 items-start justify-between gap-4 px-6 pb-4 pt-5">
          <div className="flex items-start gap-3">
            {icon && (
              <span
                aria-hidden="true"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-xl"
              >
                {icon}
              </span>
            )}
            <div>
              <h3 className="text-base font-semibold text-slate-800">{title}</h3>
              {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-2 -mt-1 rounded-md px-2 py-1 text-lg leading-none text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto border-t border-slate-100 px-6 py-5">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
