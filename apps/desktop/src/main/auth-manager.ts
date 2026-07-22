import path from 'node:path';
import {
  createKeyfile,
  deriveDbKeyHex,
  KeyfileStore,
  recordFailure,
  remainingDelaySeconds,
  rewrapPassphraseSlot,
  rotateRecoveryKey,
  ThrottleStore,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
  INITIAL_THROTTLE_STATE,
  type ScryptParams,
} from '@ajnutrition/security';
import { AppError, type AuthStatusDto } from '@ajnutrition/shared';
import { createContainer, type AppContainer } from './container';
import { BackupService, defaultBackupFileName, type CreateBackupResult } from './backup-service';

export interface AuthManagerOptions {
  userDataPath: string;
  appVersion: string;
  now?: () => Date;
  /** Reduced in tests only; production always uses the library default. */
  kdfParams?: ScryptParams;
  onStatusChanged?: (status: AuthStatusDto) => void;
}

/**
 * Owns the setup-required → locked → unlocked state machine (S-106/S-107).
 *
 * - The container (and with it the decrypted DB handle) exists only while
 *   unlocked; `lock()` closes the database and zeroes key material.
 * - Failed unlock attempts are throttled via a file OUTSIDE the encrypted DB.
 * - Failed attempts cannot be audited to the (locked) DB; instead the count
 *   since the last unlock is attached to the next successful unlock's audit
 *   event (ADR-0010).
 */
export class AuthManager {
  private readonly keyfileStore: KeyfileStore;
  private readonly throttleStore: ThrottleStore;
  private readonly backupService: BackupService;
  private readonly now: () => Date;
  private container: AppContainer | null = null;
  private masterKey: Buffer | null = null;

  constructor(private readonly options: AuthManagerOptions) {
    const securityDir = path.join(options.userDataPath, 'security');
    const keyfilePath = path.join(securityDir, 'keyfile.json');
    this.keyfileStore = new KeyfileStore(keyfilePath);
    this.throttleStore = new ThrottleStore(path.join(securityDir, 'throttle.json'));
    this.now = options.now ?? (() => new Date());
    this.backupService = new BackupService({
      paths: {
        dataDir: path.join(options.userDataPath, 'data'),
        dbPath: path.join(options.userDataPath, 'data', 'ajnutrition.db3'),
        keyfilePath,
      },
      appVersion: options.appVersion,
      now: this.now,
    });
  }

  getStatus(): AuthStatusDto {
    const throttle = this.throttleStore.load();
    return {
      state: !this.keyfileStore.exists()
        ? 'setup-required'
        : this.container !== null
          ? 'unlocked'
          : 'locked',
      retryDelaySeconds: remainingDelaySeconds(throttle, this.now()),
      failedAttempts: throttle.failedCount,
    };
  }

  /** First-run: create keyfile + encrypted DB. Returns the one-time recovery key. */
  setup(passphrase: string): { recoveryKey: string } {
    if (this.keyfileStore.exists()) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'La aplicación ya fue configurada. Use la pantalla de desbloqueo.',
      });
    }
    const created = this.options.kdfParams
      ? createKeyfile(passphrase, this.now, this.options.kdfParams)
      : createKeyfile(passphrase, this.now);
    this.keyfileStore.save(created.keyfile);
    this.openContainer(created.masterKey);
    this.getContainer().audit.record({
      action: 'auth.setup',
      entityType: 'auth',
      entityId: null,
      result: 'success',
    });
    this.emitStatus();
    return { recoveryKey: created.recoveryKey };
  }

  unlock(passphrase: string): void {
    this.assertLockedWithKeyfile();
    this.assertNotThrottled();
    const keyfile = this.keyfileStore.load();
    let masterKey: Buffer;
    try {
      masterKey = unlockWithPassphrase(keyfile, passphrase);
    } catch (err) {
      this.registerFailedAttempt();
      throw err;
    }
    this.completeUnlock(masterKey, 'passphrase');
  }

  /** Recovery unlock: forces a passphrase reset and rotates the recovery key. */
  unlockWithRecovery(recoveryKeyInput: string, newPassphrase: string): { recoveryKey: string } {
    this.assertLockedWithKeyfile();
    this.assertNotThrottled();
    const keyfile = this.keyfileStore.load();
    let masterKey: Buffer;
    try {
      masterKey = unlockWithRecoveryKey(keyfile, recoveryKeyInput);
    } catch (err) {
      this.registerFailedAttempt();
      throw err;
    }
    const rewrapped = this.options.kdfParams
      ? rewrapPassphraseSlot(keyfile, masterKey, newPassphrase, this.now, this.options.kdfParams)
      : rewrapPassphraseSlot(keyfile, masterKey, newPassphrase, this.now);
    const rotated = rotateRecoveryKey(rewrapped, masterKey, this.now);
    this.keyfileStore.save(rotated.keyfile);
    this.completeUnlock(masterKey, 'recovery-key');
    return { recoveryKey: rotated.recoveryKey };
  }

  lock(reason: 'manual' | 'inactivity' | 'os-lock' | 'quit'): void {
    if (this.container === null) return;
    try {
      this.container.audit.record({
        action: 'auth.lock',
        entityType: 'auth',
        entityId: null,
        result: 'success',
        metadata: { reason },
      });
    } catch {
      // Locking must never fail because the audit write failed.
    }
    this.container.db.close();
    this.container = null;
    this.masterKey?.fill(0);
    this.masterKey = null;
    this.emitStatus();
  }

  /** Suggested file name for the save dialog. */
  suggestedBackupFileName(): string {
    return defaultBackupFileName(this.now());
  }

  /** Creates an encrypted backup at the user-chosen destination. Requires unlocked. */
  createBackup(destinationPath: string, description: string | null): CreateBackupResult {
    const container = this.getContainer();
    if (this.masterKey === null) {
      throw new AppError({ code: 'UNEXPECTED', message: 'Estado de sesión inconsistente.' });
    }
    const result = this.backupService.create(
      container.db,
      this.masterKey,
      this.keyfileStore.load(),
      destinationPath,
      description,
    );
    container.audit.record({
      action: 'backup.create',
      entityType: 'backup',
      entityId: null,
      result: 'success',
      metadata: { fileName: result.fileName, sizeBytes: result.sizeBytes },
    });
    return result;
  }

  /** Header-only backup preview: metadata + compatibility, no passphrase needed. */
  previewBackup(sourcePath: string): {
    createdAt: string;
    appVersion: string;
    schemaVersion: number;
    description: string | null;
    sizeBytes: number;
  } {
    const header = this.backupService.preview(sourcePath);
    return {
      createdAt: header.createdAt,
      appVersion: header.appVersion,
      schemaVersion: header.schemaVersion,
      description: header.description,
      sizeBytes: header.sizeBytes,
    };
  }

  /**
   * Restores a backup (any auth state — including a brand-new machine).
   * Wrong passphrases feed the same throttle as unlock attempts.
   */
  restoreBackup(sourcePath: string, passphrase: string): { backupCreatedAt: string } {
    this.assertNotThrottled();
    let restored;
    try {
      // Validation happens against the staged copy; the live db/keyfile are
      // only swapped after full verification inside the service. Close our
      // handle first so the swap never races an open connection.
      const wasUnlocked = this.container !== null;
      if (wasUnlocked) this.lock('manual');
      restored = this.backupService.restore(sourcePath, passphrase);
    } catch (err) {
      if (err instanceof AppError && err.code === 'AUTHORIZATION') {
        this.registerFailedAttempt();
      }
      throw err;
    }
    this.completeUnlock(restored.masterKey, 'passphrase');
    this.getContainer().audit.record({
      action: 'backup.restore',
      entityType: 'backup',
      entityId: null,
      result: 'success',
      metadata: {
        backupCreatedAt: restored.backupCreatedAt,
        backupSchemaVersion: restored.schemaVersion,
      },
    });
    return { backupCreatedAt: restored.backupCreatedAt };
  }

  /** The only path to privileged operations. Throws while locked. */
  getContainer(): AppContainer {
    if (this.container === null) {
      throw new AppError({
        code: 'AUTHORIZATION',
        message: 'La aplicación está bloqueada. Desbloquéela para continuar.',
      });
    }
    return this.container;
  }

  isUnlocked(): boolean {
    return this.container !== null;
  }

  private completeUnlock(masterKey: Buffer, method: 'passphrase' | 'recovery-key'): void {
    const failedBefore = this.throttleStore.load().failedCount;
    this.openContainer(masterKey);
    this.throttleStore.save(INITIAL_THROTTLE_STATE);
    this.getContainer().audit.record({
      action: 'auth.unlock',
      entityType: 'auth',
      entityId: null,
      result: 'success',
      metadata: { method, failedAttemptsSinceLastUnlock: failedBefore },
    });
    this.emitStatus();
  }

  private openContainer(masterKey: Buffer): void {
    const dbKeyHex = deriveDbKeyHex(masterKey);
    this.container = createContainer(this.options.userDataPath, this.options.appVersion, dbKeyHex);
    this.masterKey = masterKey;
  }

  private assertLockedWithKeyfile(): void {
    if (!this.keyfileStore.exists()) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'La aplicación aún no está configurada.',
      });
    }
    if (this.container !== null) {
      throw new AppError({ code: 'CONFLICT', message: 'La aplicación ya está desbloqueada.' });
    }
  }

  private assertNotThrottled(): void {
    const remaining = remainingDelaySeconds(this.throttleStore.load(), this.now());
    if (remaining > 0) {
      throw new AppError({
        code: 'AUTHORIZATION',
        message: `Demasiados intentos fallidos. Espere ${remaining} segundos e intente de nuevo.`,
      });
    }
  }

  private registerFailedAttempt(): void {
    this.throttleStore.save(recordFailure(this.throttleStore.load(), this.now()));
    this.emitStatus();
  }

  private emitStatus(): void {
    this.options.onStatusChanged?.(this.getStatus());
  }
}
