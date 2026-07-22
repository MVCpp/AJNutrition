import type { SerializedAppError } from '../errors';

/**
 * Every IPC invocation resolves to this envelope. Handlers never reject with
 * raw exceptions: rejections would leak stack traces and internal paths to the
 * renderer. The renderer branches on `ok`.
 */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: SerializedAppError };
