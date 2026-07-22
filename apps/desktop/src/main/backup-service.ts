import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  decryptBackupPayload,
  readBackupContainer,
  unlockWithPassphrase,
  writeBackupContainer,
  type BackupHeader,
  type KeyfileV1,
} from '@ajnutrition/security';
import { AppError } from '@ajnutrition/shared';
import { checkIntegrity, MIGRATIONS, openDatabase, type SqliteDatabase } from '@ajnutrition/database';
import { deriveDbKeyHex } from '@ajnutrition/security';

/**
 * Backup/restore orchestration (S-109, ADR-0011). Main-process only.
 *
 * Create: VACUUM INTO staging snapshot (consistent, still DB-key-encrypted)
 *   → verify snapshot opens + integrity → wrap in .ajnbackup container
 *   (independent AES-GCM layer) → write to the user-chosen destination.
 *
 * Restore: parse + hash-check container → unwrap master key from the
 *   CONTAINER's keyfile with the passphrase → decrypt payload → stage
 *   snapshot → open + integrity + schema checks → atomic swap with rollback
 *   copies (db + keyfile). Nothing is replaced until the staged snapshot has
 *   been fully validated.
 */

export interface BackupPaths {
  dataDir: string;
  dbPath: string;
  keyfilePath: string;
}

export interface BackupServiceOptions {
  paths: BackupPaths;
  appVersion: string;
  now: () => Date;
}

export interface CreateBackupResult {
  fileName: string;
  filePath: string;
  sizeBytes: number;
  createdAt: string;
}

export interface RestoreResult {
  masterKey: Buffer;
  keyfile: KeyfileV1;
  backupCreatedAt: string;
  schemaVersion: number;
}

export function defaultBackupFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `AJNutrition_Backup_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.ajnbackup`;
}

export class BackupService {
  constructor(private readonly options: BackupServiceOptions) {}

  /** Requires an unlocked session (live db + master key + current keyfile). */
  create(
    db: SqliteDatabase,
    masterKey: Buffer,
    keyfile: KeyfileV1,
    destinationPath: string,
    description: string | null,
  ): CreateBackupResult {
    const { paths, appVersion, now } = this.options;
    const createdAt = now().toISOString();
    const stagingPath = path.join(paths.dataDir, 'staging-backup.db3');
    rmSync(stagingPath, { force: true });

    try {
      db.prepare('VACUUM INTO ?').run(stagingPath);

      // Verify the snapshot BEFORE packaging it: it must open with the same
      // DB key and pass integrity — a corrupt backup discovered at restore
      // time is a disaster; discovered now it is a retry.
      const dbKeyHex = deriveDbKeyHex(masterKey);
      const snapshot = openDatabase(stagingPath, dbKeyHex);
      const integrity = checkIntegrity(snapshot);
      const schemaRow = snapshot
        .prepare('SELECT MAX(id) AS max_id FROM schema_migrations')
        .get() as { max_id: number | null };
      snapshot.close();
      if (!integrity.ok) {
        throw new AppError({
          code: 'BACKUP',
          message: 'La verificación del respaldo falló. No se creó ningún archivo.',
          internalDetail: `snapshot integrity: ${integrity.detail}`,
        });
      }

      const container = writeBackupContainer({
        payload: readFileSync(stagingPath),
        masterKey,
        keyfile,
        meta: {
          createdAt,
          appVersion,
          schemaVersion: schemaRow.max_id ?? 0,
          description,
        },
      });
      writeFileSync(destinationPath, container, { mode: 0o600 });
      return {
        fileName: path.basename(destinationPath),
        filePath: destinationPath,
        sizeBytes: container.length,
        createdAt,
      };
    } finally {
      rmSync(stagingPath, { force: true });
    }
  }

  /** Header-only preview: no passphrase, no decryption. */
  preview(sourcePath: string): BackupHeader & { sizeBytes: number } {
    const file = this.readBackupFile(sourcePath);
    const parsed = readBackupContainer(file);
    return { ...parsed.header, sizeBytes: file.length };
  }

  /**
   * Full restore. On success the LIVE db and keyfile have been replaced
   * (previous versions kept as .pre-restore rollback copies) and the caller
   * receives the master key to reopen the container in unlocked state.
   * Throws AUTHORIZATION on a wrong passphrase — callers must route that
   * through the unlock throttle.
   */
  restore(sourcePath: string, passphrase: string): RestoreResult {
    const { paths } = this.options;
    const parsed = readBackupContainer(this.readBackupFile(sourcePath));

    const knownSchema = Math.max(...MIGRATIONS.map((m) => m.id));
    if (parsed.header.schemaVersion > knownSchema) {
      throw new AppError({
        code: 'RESTORE',
        message:
          'Este respaldo proviene de una versión más reciente de AJNutrition. Actualice la aplicación para restaurarlo.',
        internalDetail: `backup schema ${parsed.header.schemaVersion} > app schema ${knownSchema}`,
      });
    }

    // Unwrap the master key from the keyfile INSIDE the backup — restore must
    // work on a machine with no local keyfile at all.
    const masterKey = unlockWithPassphrase(parsed.header.keyfile, passphrase);
    const payload = decryptBackupPayload(parsed, masterKey);

    // Stage and validate the snapshot before touching anything live.
    mkdirSync(paths.dataDir, { recursive: true });
    const stagingPath = path.join(paths.dataDir, 'staging-restore.db3');
    rmSync(stagingPath, { force: true });
    writeFileSync(stagingPath, payload, { mode: 0o600 });
    try {
      const snapshot = openDatabase(stagingPath, deriveDbKeyHex(masterKey));
      const integrity = checkIntegrity(snapshot);
      snapshot.close();
      if (!integrity.ok) {
        throw new AppError({
          code: 'RESTORE',
          message: 'El contenido del respaldo no superó la verificación de integridad.',
          internalDetail: `restored snapshot integrity: ${integrity.detail}`,
        });
      }
      this.swapIntoPlace(stagingPath, parsed.header.keyfile);
    } finally {
      rmSync(stagingPath, { force: true });
    }

    return {
      masterKey,
      keyfile: parsed.header.keyfile,
      backupCreatedAt: parsed.header.createdAt,
      schemaVersion: parsed.header.schemaVersion,
    };
  }

  private swapIntoPlace(stagingPath: string, keyfile: KeyfileV1): void {
    const { paths } = this.options;
    const rollbackDb = `${paths.dbPath}.pre-restore`;
    const rollbackKeyfile = `${paths.keyfilePath}.pre-restore`;
    const hadLiveDb = existsSync(paths.dbPath);

    if (hadLiveDb) {
      rmSync(rollbackDb, { force: true });
      renameSync(paths.dbPath, rollbackDb);
      // Stale WAL/SHM of the replaced database must not survive the swap.
      rmSync(`${paths.dbPath}-wal`, { force: true });
      rmSync(`${paths.dbPath}-shm`, { force: true });
    }
    try {
      renameSync(stagingPath, paths.dbPath);
    } catch (err) {
      if (hadLiveDb) renameSync(rollbackDb, paths.dbPath);
      throw new AppError({
        code: 'RESTORE',
        message: 'No fue posible reemplazar la base de datos. Se conservaron los datos anteriores.',
        internalDetail: `swap failed: ${String(err)}`,
        cause: err,
      });
    }

    if (existsSync(paths.keyfilePath)) {
      rmSync(rollbackKeyfile, { force: true });
      renameSync(paths.keyfilePath, rollbackKeyfile);
    }
    mkdirSync(path.dirname(paths.keyfilePath), { recursive: true });
    const tempKeyfile = `${paths.keyfilePath}.tmp`;
    writeFileSync(tempKeyfile, JSON.stringify(keyfile, null, 2), { mode: 0o600 });
    renameSync(tempKeyfile, paths.keyfilePath);
  }

  private readBackupFile(sourcePath: string): Buffer {
    try {
      return readFileSync(sourcePath);
    } catch (err) {
      throw new AppError({
        code: 'FILE',
        message: 'No fue posible leer el archivo de respaldo seleccionado.',
        internalDetail: `backup read failed: ${String(err)}`,
        cause: err,
      });
    }
  }
}
