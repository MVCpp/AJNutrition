import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { unwrap } from '../api';

const MIN_SCALE = 1;
const MAX_SCALE = 6;

/**
 * Full-screen photo visor: wheel or buttons to zoom, drag to pan while
 * zoomed, double-click to toggle 1× ↔ 2.5×, Escape/backdrop/✕ to close.
 */
export function PhotoViewer({
  photoId,
  caption,
  onClose,
}: {
  photoId: string;
  caption: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );

  const dataQuery = useQuery({
    queryKey: ['photo-data', photoId],
    queryFn: () => unwrap(window.ajnutrition.photo.get({ photoId })),
    staleTime: Infinity,
  });

  const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
  const zoomBy = (factor: number) =>
    setScale((current) => {
      const next = clampScale(current * factor);
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === '+' || event.key === '=') {
        setScale((current) => Math.min(MAX_SCALE, current * 1.25));
      }
      if (event.key === '-') setScale((current) => Math.max(MIN_SCALE, current * 0.8));
      if (event.key === '0') {
        setScale(1);
        setOffset({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="ajn-backdrop fixed inset-0 z-50 flex flex-col bg-slate-950/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between px-6 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-slate-200">{caption}</p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => zoomBy(0.8)}
            aria-label={t('photos.zoomOut')}
            className="h-9 w-9 rounded-lg bg-white/10 text-lg leading-none transition-colors hover:bg-white/20"
          >
            −
          </button>
          <span className="w-14 text-center text-xs tabular-nums text-slate-300">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => zoomBy(1.25)}
            aria-label={t('photos.zoomIn')}
            className="h-9 w-9 rounded-lg bg-white/10 text-lg leading-none transition-colors hover:bg-white/20"
          >
            +
          </button>
          <button
            type="button"
            onClick={reset}
            className="ml-1 rounded-lg bg-white/10 px-3 py-2 text-xs transition-colors hover:bg-white/20"
          >
            {t('photos.zoomReset')}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="ml-3 h-9 w-9 rounded-lg bg-white/10 text-base transition-colors hover:bg-white/20"
          >
            ✕
          </button>
        </div>
      </div>

      <div
        className="flex flex-1 items-center justify-center overflow-hidden px-6 pb-6"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.15 : 0.87)}
        onDoubleClick={() => (scale > 1 ? reset() : setScale(2.5))}
        onPointerDown={(e) => {
          if (scale === 1) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          dragState.current = {
            startX: e.clientX,
            startY: e.clientY,
            baseX: offset.x,
            baseY: offset.y,
          };
        }}
        onPointerMove={(e) => {
          if (!dragState.current) return;
          setOffset({
            x: dragState.current.baseX + (e.clientX - dragState.current.startX),
            y: dragState.current.baseY + (e.clientY - dragState.current.startY),
          });
        }}
        onPointerUp={() => {
          dragState.current = null;
        }}
        style={{ cursor: scale > 1 ? 'grab' : 'zoom-in' }}
      >
        {dataQuery.data ? (
          <img
            src={dataQuery.data.dataUrl}
            alt={caption}
            draggable={false}
            className="max-h-full max-w-full select-none rounded-lg shadow-2xl"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transition: dragState.current ? 'none' : 'transform 120ms ease-out',
            }}
          />
        ) : (
          <p className="text-sm text-slate-300">{t('photos.loading')}</p>
        )}
      </div>
      <p className="pb-3 text-center text-xs text-slate-400" onClick={(e) => e.stopPropagation()}>
        {t('photos.viewerHint')}
      </p>
    </div>
  );
}
