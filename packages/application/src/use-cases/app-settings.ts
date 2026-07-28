import type { DomainContext } from '@ajnutrition/domain';
import {
  AUTO_BACKUP_DEFAULT_KEEP,
  AUTO_LOCK_DEFAULT_MINUTES,
  REMINDER_DEFAULT_MINUTES,
  type AppSettingsDto,
  type SaveAppSettingsCommand,
} from '@ajnutrition/shared';
import type { AppSettingsRecord, AppSettingsRepository } from '../ports/app-settings-repository';
import type { AuditLog } from '../ports/audit-log';
import type { UnitOfWork } from '../ports/unit-of-work';

export interface AppSettingsDeps {
  uow: UnitOfWork;
  settings: AppSettingsRepository;
  audit: AuditLog;
  ctx: DomainContext;
}

/** What the app assumes before the practitioner has saved anything. */
const DEFAULTS = {
  autoLockMinutes: AUTO_LOCK_DEFAULT_MINUTES,
  autoBackupEnabled: false,
  autoBackupFolder: null,
  autoBackupKeep: AUTO_BACKUP_DEFAULT_KEEP,
  lastAutoBackupAt: null,
  remindersEnabled: true,
  reminderMinutes: REMINDER_DEFAULT_MINUTES,
} as const;

function toDto(record: AppSettingsRecord | null): AppSettingsDto {
  return record === null
    ? { ...DEFAULTS, updatedAt: null }
    : {
        autoLockMinutes: record.autoLockMinutes,
        autoBackupEnabled: record.autoBackupEnabled,
        autoBackupFolder: record.autoBackupFolder,
        autoBackupKeep: record.autoBackupKeep,
        lastAutoBackupAt: record.lastAutoBackupAt,
        remindersEnabled: record.remindersEnabled,
        reminderMinutes: record.reminderMinutes,
        updatedAt: record.updatedAt,
      };
}

export class GetAppSettingsUseCase {
  constructor(private readonly deps: Pick<AppSettingsDeps, 'settings'>) {}

  execute(): AppSettingsDto {
    return toDto(this.deps.settings.get());
  }
}

export class SaveAppSettingsUseCase {
  constructor(private readonly deps: AppSettingsDeps) {}

  /** Patch semantics: absent fields keep their stored value. */
  execute(command: SaveAppSettingsCommand): AppSettingsDto {
    const { uow, settings, audit, ctx } = this.deps;
    return uow.run(() => {
      const current = settings.get() ?? { ...DEFAULTS, updatedAt: ctx.now().toISOString() };
      const record: AppSettingsRecord = {
        ...current,
        autoLockMinutes: command.autoLockMinutes ?? current.autoLockMinutes,
        autoBackupEnabled: command.autoBackupEnabled ?? current.autoBackupEnabled,
        autoBackupKeep: command.autoBackupKeep ?? current.autoBackupKeep,
        remindersEnabled: command.remindersEnabled ?? current.remindersEnabled,
        reminderMinutes: command.reminderMinutes ?? current.reminderMinutes,
        updatedAt: ctx.now().toISOString(),
      };
      settings.save(record);
      // Auto-lock and backups are security controls: worth an audit entry.
      audit.record({
        action: 'settings.save',
        entityType: 'app-settings',
        entityId: null,
        result: 'success',
        metadata: {
          autoLockMinutes: record.autoLockMinutes,
          autoBackupEnabled: record.autoBackupEnabled,
          autoBackupKeep: record.autoBackupKeep,
          remindersEnabled: record.remindersEnabled,
        },
      });
      return toDto(record);
    });
  }
}

/**
 * Bookkeeping after a successful scheduled backup. Not audited here: the
 * backup itself is already recorded as `backup.create`.
 */
export class RecordAutoBackupRunUseCase {
  constructor(private readonly deps: Pick<AppSettingsDeps, 'settings'>) {}

  execute(isoTimestamp: string): void {
    this.deps.settings.markAutoBackupRun(isoTimestamp);
  }
}

/**
 * Sets the automatic-backup destination. Separate from SaveAppSettings because
 * the path comes from a native dialog in the main process, never from the
 * renderer — nothing reachable over IPC may name an arbitrary write target.
 */
export class SetAutoBackupFolderUseCase {
  constructor(private readonly deps: AppSettingsDeps) {}

  execute(folder: string): AppSettingsDto {
    const { uow, settings, audit, ctx } = this.deps;
    return uow.run(() => {
      const current = settings.get() ?? { ...DEFAULTS, updatedAt: ctx.now().toISOString() };
      const record: AppSettingsRecord = {
        ...current,
        autoBackupFolder: folder,
        updatedAt: ctx.now().toISOString(),
      };
      settings.save(record);
      // The path itself stays out of the audit metadata: it embeds the OS
      // account name and audit rows are exportable.
      audit.record({
        action: 'settings.save',
        entityType: 'app-settings',
        entityId: null,
        result: 'success',
        metadata: { autoBackupFolderSet: true },
      });
      return toDto(record);
    });
  }
}
