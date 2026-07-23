import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { AppError } from '@ajnutrition/shared';
import type { KeyfileV1 } from './keyfile';

const EnvelopeSchema = z
  .object({
    v: z.literal(1),
    alg: z.literal('aes-256-gcm'),
    nonceB64: z.string().min(1),
    ciphertextB64: z.string().min(1),
    tagB64: z.string().min(1),
  })
  .strict();

const KeyfileSchema = z
  .object({
    version: z.literal(1),
    createdAt: z.string(),
    updatedAt: z.string(),
    kdf: z
      .object({
        algorithm: z.literal('scrypt'),
        N: z.number().int().min(16384),
        r: z.number().int().min(1),
        p: z.number().int().min(1),
        saltB64: z.string().min(1),
      })
      .strict(),
    passphraseSlot: EnvelopeSchema,
    recoverySlot: EnvelopeSchema,
    recoverySaltB64: z.string().min(1),
  })
  .strict();

/**
 * Keyfile persistence with atomic replace (write temp → rename) so a crash
 * mid-write can never leave a half-written keyfile — the previous version
 * survives intact. Corrupt or tampered files fail Zod validation loudly.
 */
export class KeyfileStore {
  constructor(private readonly filePath: string) {}

  exists(): boolean {
    return existsSync(this.filePath);
  }

  load(): KeyfileV1 {
    let raw: string;
    try {
      raw = readFileSync(this.filePath, 'utf8');
    } catch (err) {
      throw new AppError({
        code: 'FILE',
        message: 'No fue posible leer el archivo de claves.',
        internalDetail: `keyfile read failed: ${String(err)}`,
        cause: err,
      });
    }
    const parsed = KeyfileSchema.safeParse(safeJsonParse(raw));
    if (!parsed.success) {
      throw new AppError({
        code: 'INTEGRITY',
        message:
          'El archivo de claves está dañado o fue modificado. Restaure una copia de seguridad.',
        internalDetail: 'keyfile failed schema validation',
      });
    }
    return parsed.data;
  }

  /** Removes the keyfile (setup rollback only — never during normal operation). */
  remove(): void {
    rmSync(this.filePath, { force: true });
  }

  save(keyfile: KeyfileV1): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(keyfile, null, 2), { mode: 0o600 });
    renameSync(tempPath, this.filePath);
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
