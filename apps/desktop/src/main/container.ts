import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { DomainContext } from '@ajnutrition/domain';
import {
  CreatePatientUseCase,
  GetPatientUseCase,
  ListPatientsUseCase,
  type AuditLog,
} from '@ajnutrition/application';
import {
  assertSchemaNotAhead,
  checkIntegrity,
  openDatabase,
  runMigrations,
  SqliteAuditLog,
  SqlitePatientRepository,
  SqliteUnitOfWork,
  type SqliteDatabase,
} from '@ajnutrition/database';
import { AppError } from '@ajnutrition/shared';

export interface AppContainer {
  db: SqliteDatabase;
  audit: AuditLog;
  useCases: {
    createPatient: CreatePatientUseCase;
    listPatients: ListPatientsUseCase;
    getPatient: GetPatientUseCase;
  };
}

/**
 * Composition root. Runs at every unlock in the main process:
 * opens the encrypted database, refuses downgrade scenarios, verifies
 * integrity, applies pending migrations, wires repositories and use cases.
 * The AuthManager owns its lifecycle (created on unlock, closed on lock).
 */
export function createContainer(
  userDataPath: string,
  appVersion: string,
  dbKeyHex: string,
): AppContainer {
  const dataDir = path.join(userDataPath, 'data');
  mkdirSync(dataDir, { recursive: true });
  const db = openDatabase(path.join(dataDir, 'ajnutrition.db3'), dbKeyHex);

  const integrity = checkIntegrity(db);
  if (!integrity.ok) {
    throw new AppError({
      code: 'INTEGRITY',
      message:
        'La base de datos local está dañada. Restaure una copia de seguridad antes de continuar.',
      internalDetail: integrity.detail,
    });
  }

  assertSchemaNotAhead(db);
  runMigrations(db);

  const ctx: DomainContext = {
    now: () => new Date(),
    newId: () => randomUUID(),
  };

  const patients = new SqlitePatientRepository(db);
  const audit = new SqliteAuditLog(db, { appVersion, now: ctx.now, newId: ctx.newId });
  const uow = new SqliteUnitOfWork(db);

  return {
    db,
    audit,
    useCases: {
      createPatient: new CreatePatientUseCase({ uow, patients, audit, ctx }),
      listPatients: new ListPatientsUseCase(patients),
      getPatient: new GetPatientUseCase(patients),
    },
  };
}
