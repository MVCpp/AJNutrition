import { detectImageMime, type DomainContext } from '@ajnutrition/domain';
import { AppError, type ProfileDto, type SaveProfileCommand } from '@ajnutrition/shared';
import type { AuditLog } from '../ports/audit-log';
import type { ProfileRepository, PractitionerProfileRecord } from '../ports/profile-repository';
import type { UnitOfWork } from '../ports/unit-of-work';

export interface ProfileDeps {
  uow: UnitOfWork;
  profile: ProfileRepository;
  audit: AuditLog;
  ctx: DomainContext;
}

const MAX_LOGO_BYTES = 1024 * 1024;

export function toProfileDto(record: PractitionerProfileRecord | null): ProfileDto | null {
  if (record === null) return null;
  return {
    fullName: record.fullName,
    title: record.title,
    license: record.license,
    phone: record.phone,
    email: record.email,
    address: record.address,
    hasLogo: record.logoBase64 !== null,
    logoDataUrl:
      record.logoBase64 !== null && record.logoMime !== null
        ? `data:${record.logoMime};base64,${record.logoBase64}`
        : null,
  };
}

export class GetProfileUseCase {
  constructor(private readonly deps: Pick<ProfileDeps, 'profile'>) {}

  execute(): ProfileDto | null {
    return toProfileDto(this.deps.profile.get());
  }
}

export class SaveProfileUseCase {
  constructor(private readonly deps: ProfileDeps) {}

  execute(command: SaveProfileCommand): ProfileDto {
    const { uow, profile, audit, ctx } = this.deps;
    return uow.run(() => {
      const existing = profile.get();
      const record: PractitionerProfileRecord = {
        fullName: command.fullName,
        title: command.title || null,
        license: command.license || null,
        phone: command.phone || null,
        email: command.email || null,
        address: command.address || null,
        logoBase64: existing?.logoBase64 ?? null,
        logoMime: existing?.logoMime ?? null,
        updatedAt: ctx.now().toISOString(),
      };
      profile.save(record);
      audit.record({
        action: 'profile.save',
        entityType: 'profile',
        entityId: null,
        result: 'success',
      });
      const dto = toProfileDto(record);
      if (dto === null) throw new AppError({ code: 'UNEXPECTED', message: 'Perfil inválido.' });
      return dto;
    });
  }
}

export class SetProfileLogoUseCase {
  constructor(private readonly deps: ProfileDeps) {}

  execute(bytes: Uint8Array): ProfileDto {
    const { uow, profile, audit, ctx } = this.deps;
    return uow.run(() => {
      const existing = profile.get();
      if (existing === null) {
        throw new AppError({
          code: 'VALIDATION',
          message: 'Guarde primero los datos del perfil antes de agregar un logotipo.',
        });
      }
      if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) {
        throw new AppError({
          code: 'VALIDATION',
          message: 'El logotipo debe pesar como máximo 1 MB.',
        });
      }
      const mime = detectImageMime(bytes);
      if (mime === null) {
        throw new AppError({
          code: 'VALIDATION',
          message: 'El logotipo debe ser una imagen JPEG o PNG válida.',
        });
      }
      const record: PractitionerProfileRecord = {
        ...existing,
        logoBase64: Buffer.from(bytes).toString('base64'),
        logoMime: mime,
        updatedAt: ctx.now().toISOString(),
      };
      profile.save(record);
      audit.record({
        action: 'profile.logo-set',
        entityType: 'profile',
        entityId: null,
        result: 'success',
        metadata: { sizeBytes: bytes.length, mime },
      });
      const dto = toProfileDto(record);
      if (dto === null) throw new AppError({ code: 'UNEXPECTED', message: 'Perfil inválido.' });
      return dto;
    });
  }
}
