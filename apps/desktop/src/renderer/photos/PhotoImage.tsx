import { useQuery } from '@tanstack/react-query';
import { unwrap } from '../api';

export function PhotoImage({
  photoId,
  alt,
  className,
}: {
  photoId: string;
  alt: string;
  className?: string;
}) {
  const dataQuery = useQuery({
    queryKey: ['photo-data', photoId],
    queryFn: () => unwrap(window.ajnutrition.photo.get({ photoId })),
    staleTime: Infinity,
  });

  if (!dataQuery.data) {
    return <div className="h-40 w-full animate-pulse rounded bg-slate-100" aria-hidden="true" />;
  }
  return (
    <img
      src={dataQuery.data.dataUrl}
      alt={alt}
      className={className ?? 'max-h-64 w-full rounded object-cover'}
    />
  );
}
