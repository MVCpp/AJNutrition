import { and, asc, eq } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ConsentRecord } from '@ajnutrition/domain';
import { AppError } from '@ajnutrition/shared';
import type { ConsentRepository } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';
import { consentRecords } from '../schema-consents';

export class SqliteConsentRepository implements ConsentRepository {
  private readonly db: BetterSQLite3Database;

  constructor(connection: SqliteDatabase) {
    this.db = drizzle(connection);
  }

  insert(record: ConsentRecord): void {
    this.db.insert(consentRecords).values(toRow(record)).run();
  }

  findById(id: string): ConsentRecord | null {
    const row = this.db.select().from(consentRecords).where(eq(consentRecords.id, id)).get();
    return row ? toDomain(row) : null;
  }

  listByPatient(patientId: string): ConsentRecord[] {
    return this.db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.patientId, patientId))
      .orderBy(asc(consentRecords.decidedAt))
      .all()
      .map(toDomain);
  }

  applyWithdrawal(record: ConsentRecord): void {
    const result = this.db
      .update(consentRecords)
      .set({ status: 'withdrawn', withdrawnAt: record.withdrawnAt })
      .where(and(eq(consentRecords.id, record.id), eq(consentRecords.status, 'accepted')))
      .run();
    if (result.changes === 0) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'El consentimiento ya fue retirado o no puede retirarse.',
      });
    }
  }
}

type ConsentRow = typeof consentRecords.$inferSelect;

function toRow(record: ConsentRecord): ConsentRow {
  return {
    id: record.id,
    patientId: record.patientId,
    consentType: record.consentType,
    noticeVersion: record.noticeVersion,
    status: record.status,
    method: record.method,
    decidedAt: record.decidedAt,
    withdrawnAt: record.withdrawnAt,
    notes: record.notes,
    createdAt: record.createdAt,
  };
}

function toDomain(row: ConsentRow): ConsentRecord {
  return {
    id: row.id,
    patientId: row.patientId,
    consentType: row.consentType,
    noticeVersion: row.noticeVersion,
    status: row.status,
    method: row.method,
    decidedAt: row.decidedAt,
    withdrawnAt: row.withdrawnAt,
    notes: row.notes,
    createdAt: row.createdAt,
  };
}
