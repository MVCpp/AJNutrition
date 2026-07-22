import type { IpcResult, SerializedAppError } from '@ajnutrition/shared';

/** Error thrown by renderer data hooks when an IPC call fails. */
export class ApiError extends Error {
  readonly detail: SerializedAppError;

  constructor(detail: SerializedAppError) {
    super(detail.message);
    this.name = 'ApiError';
    this.detail = detail;
  }
}

/** Unwraps the IPC envelope for TanStack Query: data on ok, throw on error. */
export async function unwrap<T>(call: Promise<IpcResult<T>>): Promise<T> {
  const result = await call;
  if (result.ok) return result.data;
  throw new ApiError(result.error);
}
