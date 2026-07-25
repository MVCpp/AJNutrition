import { desc, eq } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { AdherenceRecord, AdherenceRepository } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';
import { adherenceEntries } from '../schema-adherence';

export class SqliteAdherenceRepository implements AdherenceRepository {
  private readonly db: BetterSQLite3Database;

  constructor(connection: SqliteDatabase) {
    this.db = drizzle(connection);
  }

  insert(record: AdherenceRecord): void {
    this.db
      .insert(adherenceEntries)
      .values({ ...record })
      .run();
  }

  listByPatient(patientId: string): AdherenceRecord[] {
    return this.db
      .select()
      .from(adherenceEntries)
      .where(eq(adherenceEntries.patientId, patientId))
      .orderBy(desc(adherenceEntries.recordedAt))
      .all()
      .map((row) => ({ ...row }));
  }
}
