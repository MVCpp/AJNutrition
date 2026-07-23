import { beforeEach, describe, expect, it } from 'vitest';
import type { DomainContext } from '@ajnutrition/domain';
import {
  GetProfileUseCase,
  SaveProfileUseCase,
  SetProfileLogoUseCase,
  type ProfileDeps,
} from '@ajnutrition/application';
import type { AppError } from '@ajnutrition/shared';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqliteProfileRepository } from './sqlite-profile-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

let db: SqliteDatabase;
let deps: ProfileDeps;
let idCounter = 0;

const ctx: DomainContext = {
  now: () => new Date('2026-07-23T12:00:00.000Z'),
  newId: () => {
    idCounter += 1;
    return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`;
  },
};

beforeEach(() => {
  idCounter = 0;
  db = openInMemoryDatabase();
  runMigrations(db);
  deps = {
    uow: new SqliteUnitOfWork(db),
    profile: new SqliteProfileRepository(db),
    audit: new SqliteAuditLog(db, { appVersion: '0.1.0-test', now: ctx.now, newId: ctx.newId }),
    ctx,
  };
});

describe('practitioner profile against real SQLite', () => {
  it('starts empty, saves, and upserts on re-save', () => {
    expect(new GetProfileUseCase(deps).execute()).toBeNull();

    const saved = new SaveProfileUseCase(deps).execute({
      fullName: 'L.N. Alejandra Jiménez',
      title: 'Licenciada en Nutrición',
      license: '12345678',
    });
    expect(saved).toMatchObject({ fullName: 'L.N. Alejandra Jiménez', hasLogo: false });

    const resaved = new SaveProfileUseCase(deps).execute({
      fullName: 'L.N. Alejandra Jiménez',
      phone: '+52 55 0000 0000',
    });
    expect(resaved.phone).toBe('+52 55 0000 0000');
    const count = db.prepare('SELECT COUNT(*) AS n FROM practitioner_profile').get() as {
      n: number;
    };
    expect(count.n).toBe(1);
  });

  it('sets a validated logo and keeps it across profile re-saves', () => {
    new SaveProfileUseCase(deps).execute({ fullName: 'L.N. Prueba' });
    const withLogo = new SetProfileLogoUseCase(deps).execute(PNG);
    expect(withLogo.hasLogo).toBe(true);
    expect(withLogo.logoDataUrl).toMatch(/^data:image\/png;base64,/);

    const resaved = new SaveProfileUseCase(deps).execute({ fullName: 'L.N. Prueba 2' });
    expect(resaved.hasLogo).toBe(true);
  });

  it('rejects a non-image logo and logo before profile', () => {
    try {
      new SetProfileLogoUseCase(deps).execute(PNG);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('VALIDATION');
    }
    new SaveProfileUseCase(deps).execute({ fullName: 'L.N. Prueba' });
    expect(() =>
      new SetProfileLogoUseCase(deps).execute(new Uint8Array([0x4d, 0x5a, 0x00])),
    ).toThrowError();
  });
});
