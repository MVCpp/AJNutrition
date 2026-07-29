import { useQuery } from '@tanstack/react-query';
import { unwrap } from '../api';

export function PhotoImage({
  photoId,
  alt,
  className,
  placeholderClassName,
}: {
  photoId: string;
  alt: string;
  className?: string;
  /**
   * Sizing for the pre-decode placeholder. Callers that put the image in a
   * fixed frame pass one that FILLS it, so the layout does not jump when the
   * bytes arrive — the default only knows about its own height.
   */
  placeholderClassName?: string;
}) {
  const dataQuery = useQuery({
    queryKey: ['photo-data', photoId],
    queryFn: () => unwrap(window.ajnutrition.photo.get({ photoId })),
    staleTime: Infinity,
  });

  if (!dataQuery.data) {
    return (
      <div
        className={placeholderClassName ?? 'h-40 w-full animate-pulse rounded bg-slate-100'}
        aria-hidden="true"
      />
    );
  }
  return (
    <img
      src={dataQuery.data.dataUrl}
      alt={alt}
      className={className ?? 'max-h-64 w-full rounded object-cover'}
    />
  );
}
