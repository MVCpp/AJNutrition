import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { openBinary, sealBinary } from '@ajnutrition/security';
import { AppError } from '@ajnutrition/shared';
import type { PhotoStorage } from '@ajnutrition/application';

/**
 * Attachment storage adapter (§33): every file is AES-256-GCM sealed with
 * the attachments key (derived from the master key at unlock) and stored
 * under a random internal name inside userData — a copied file is opaque,
 * and a file swapped between names fails its AAD binding.
 */
export class EncryptedPhotoStorage implements PhotoStorage {
  constructor(
    private readonly dir: string,
    private readonly key: Buffer,
  ) {}

  private filePath(storageName: string): string {
    // storageName is always an app-generated UUID; reject anything else so a
    // corrupted metadata row can never traverse paths (§33).
    if (!/^[0-9a-f-]{36}$/i.test(storageName)) {
      throw new AppError({
        code: 'FILE',
        message: 'Nombre de almacenamiento inválido.',
        internalDetail: 'storage name failed uuid check',
      });
    }
    return path.join(this.dir, `${storageName}.ajnenc`);
  }

  save(storageName: string, bytes: Uint8Array): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.filePath(storageName), sealBinary(bytes, this.key, storageName), {
      mode: 0o600,
    });
  }

  read(storageName: string): Uint8Array {
    return openBinary(readFileSync(this.filePath(storageName)), this.key, storageName);
  }

  remove(storageName: string): void {
    rmSync(this.filePath(storageName), { force: true });
  }
}
