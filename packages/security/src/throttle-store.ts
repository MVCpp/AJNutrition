import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { INITIAL_THROTTLE_STATE, type ThrottleState } from './throttle';

const ThrottleSchema = z
  .object({
    failedCount: z.number().int().min(0),
    lastFailedAtIso: z.string().nullable(),
  })
  .strict();

/**
 * Persists failed-attempt state OUTSIDE the encrypted database (which is
 * unreadable exactly when this state matters). A corrupt or missing file
 * degrades to the initial state — deleting it only removes the UI delay,
 * never the cryptographic protection.
 */
export class ThrottleStore {
  constructor(private readonly filePath: string) {}

  load(): ThrottleState {
    if (!existsSync(this.filePath)) return INITIAL_THROTTLE_STATE;
    try {
      const parsed = ThrottleSchema.safeParse(JSON.parse(readFileSync(this.filePath, 'utf8')));
      return parsed.success ? parsed.data : INITIAL_THROTTLE_STATE;
    } catch {
      return INITIAL_THROTTLE_STATE;
    }
  }

  save(state: ThrottleState): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(state), { mode: 0o600 });
    renameSync(tempPath, this.filePath);
  }
}
