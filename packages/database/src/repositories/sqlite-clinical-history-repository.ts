import { and, asc, eq, isNull } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ClinicalHistoryEntry } from '@ajnutrition/domain';
import { AppError } from '@ajnutrition/shared';
import type { ClinicalHistoryRepository } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';
import { clinicalHistoryEntries } from '../schema-clinical-history';

export class SqliteClinicalHistoryRepository implements ClinicalHistoryRepository {
  private readonly db: BetterSQLite3Database;

  constructor(connection: SqliteDatabase) {
    this.db = drizzle(connection);
  }

  insert(entry: ClinicalHistoryEntry): void {
    this.db
      .insert(clinicalHistoryEntries)
      .values({
        id: entry.id,
        patientId: entry.patientId,
        category: entry.category,
        content: entry.content,
        supersededAt: entry.supersededAt,
        supersededById: entry.supersededById,
        createdAt: entry.createdAt,
      })
      .run();
  }

  findById(id: string): ClinicalHistoryEntry | null {
    const row = this.db
      .select()
      .from(clinicalHistoryEntries)
      .where(eq(clinicalHistoryEntries.id, id))
      .get();
    return row ? toDomain(row) : null;
  }

  listByPatient(patientId: string, includeSuperseded: boolean): ClinicalHistoryEntry[] {
    const filters = [eq(clinicalHistoryEntries.patientId, patientId)];
    if (!includeSuperseded) {
      filters.push(isNull(clinicalHistoryEntries.supersededAt));
    }
    return this.db
      .select()
      .from(clinicalHistoryEntries)
      .where(and(...filters))
      .orderBy(asc(clinicalHistoryEntries.category), asc(clinicalHistoryEntries.createdAt))
      .all()
      .map(toDomain);
  }

  markSuperseded(id: string, supersededById: string, supersededAt: string): void {
    const result = this.db
      .update(clinicalHistoryEntries)
      .set({ supersededAt, supersededById })
      .where(and(eq(clinicalHistoryEntries.id, id), isNull(clinicalHistoryEntries.supersededAt)))
      .run();
    if (result.changes === 0) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'El antecedente ya fue actualizado por otra operación.',
      });
    }
  }
}

type HistoryRow = typeof clinicalHistoryEntries.$inferSelect;

function toDomain(row: HistoryRow): ClinicalHistoryEntry {
  return {
    id: row.id,
    patientId: row.patientId,
    category: row.category,
    content: row.content,
    createdAt: row.createdAt,
    supersededAt: row.supersededAt,
    supersededById: row.supersededById,
  };
}
