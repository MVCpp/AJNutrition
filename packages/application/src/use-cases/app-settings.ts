import type { DomainContext } from '@ajnutrition/domain';
import {
  AUTO_LOCK_DEFAULT_MINUTES,
  type AppSettingsDto,
  type SaveAppSettingsCommand,
} from '@ajnutrition/shared';
import type { AppSettingsRepository } from '../ports/app-settings-repository';
import type { AuditLog } from '../ports/audit-log';
import type { UnitOfWork } from '../ports/unit-of-work';

export interface AppSettingsDeps {
  uow: UnitOfWork;
  settings: AppSettingsRepository;
  audit: AuditLog;
  ctx: DomainContext;
}

export class GetAppSettingsUseCase {
  constructor(private readonly deps: Pick<AppSettingsDeps, 'settings'>) {}

  execute(): AppSettingsDto {
    const record = this.deps.settings.get();
    return record === null
      ? { autoLockMinutes: AUTO_LOCK_DEFAULT_MINUTES, updatedAt: null }
      : { autoLockMinutes: record.autoLockMinutes, updatedAt: record.updatedAt };
  }
}

export class SaveAppSettingsUseCase {
  constructor(private readonly deps: AppSettingsDeps) {}

  execute(command: SaveAppSettingsCommand): AppSettingsDto {
    const { uow, settings, audit, ctx } = this.deps;
    return uow.run(() => {
      const record = {
        autoLockMinutes: command.autoLockMinutes,
        updatedAt: ctx.now().toISOString(),
      };
      settings.save(record);
      // A security control changed: worth an audit trail entry.
      audit.record({
        action: 'settings.save',
        entityType: 'app-settings',
        entityId: null,
        result: 'success',
        metadata: { autoLockMinutes: record.autoLockMinutes },
      });
      return record;
    });
  }
}
