/**
 * Client-side pagination shared by every long list (foods, patients).
 * Pure and unit-tested: the lists themselves stay declarative.
 */
export interface PageSlice<T> {
  totalPages: number;
  /** Requested page clamped into [0, totalPages - 1]. */
  safePage: number;
  pageItems: T[];
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): PageSlice<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  return {
    totalPages,
    safePage,
    pageItems: items.slice(safePage * pageSize, safePage * pageSize + pageSize),
  };
}
