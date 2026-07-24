import { asc, desc, eq } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { LabRepository, LabResultRecord } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';
import { labResults } from '../schema-labs';

export class SqliteLabRepository implements LabRepository {
  private readonly db: BetterSQLite3Database;

  constructor(connection: SqliteDatabase) {
    this.db = drizzle(connection);
  }

  insertMany(records: LabResultRecord[]): void {
    for (const record of records) {
      this.db
        .insert(labResults)
        .values({ ...record })
        .run();
    }
  }

  listByPatient(patientId: string): LabResultRecord[] {
    return this.db
      .select()
      .from(labResults)
      .where(eq(labResults.patientId, patientId))
      .orderBy(desc(labResults.collectedAt), asc(labResults.analyte))
      .all()
      .map((row) => ({ ...row }));
  }
}
