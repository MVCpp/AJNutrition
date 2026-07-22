import type { UnitOfWork } from '@ajnutrition/application';
import type { SqliteDatabase } from './connection';

/**
 * Maps the UnitOfWork port onto a better-sqlite3 transaction.
 * Nested calls reuse the surrounding transaction (better-sqlite3 savepoints).
 */
export class SqliteUnitOfWork implements UnitOfWork {
  constructor(private readonly db: SqliteDatabase) {}

  run<T>(work: () => T): T {
    return this.db.transaction(work)();
  }
}
