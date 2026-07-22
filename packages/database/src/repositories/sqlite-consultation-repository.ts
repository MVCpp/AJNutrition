import { and, asc, desc, eq } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Consultation, ConsultationAmendment } from '@ajnutrition/domain';
import { AppError } from '@ajnutrition/shared';
import type { ConsultationRepository } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';
import { consultationAmendments, consultations } from '../schema-consultations';

export class SqliteConsultationRepository implements ConsultationRepository {
  private readonly db: BetterSQLite3Database;

  constructor(connection: SqliteDatabase) {
    this.db = drizzle(connection);
  }

  insert(consultation: Consultation): void {
    this.db.insert(consultations).values(toRow(consultation)).run();
  }

  findById(id: string): Consultation | null {
    const row = this.db.select().from(consultations).where(eq(consultations.id, id)).get();
    return row ? toDomain(row) : null;
  }

  listByPatient(patientId: string): Consultation[] {
    return this.db
      .select()
      .from(consultations)
      .where(eq(consultations.patientId, patientId))
      .orderBy(desc(consultations.consultationDate), desc(consultations.createdAt))
      .all()
      .map(toDomain);
  }

  /**
   * Optimistic concurrency: the row is replaced only if it still carries the
   * version this update was derived from. Zero affected rows = a concurrent
   * writer won; the caller gets a CONFLICT, never a silent overwrite.
   */
  update(consultation: Consultation): void {
    const result = this.db
      .update(consultations)
      .set(toRow(consultation))
      .where(
        and(
          eq(consultations.id, consultation.id),
          eq(consultations.version, consultation.version - 1),
        ),
      )
      .run();
    if (result.changes === 0) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'La consulta fue modificada por otra operación. Recargue e intente de nuevo.',
      });
    }
  }

  insertAmendment(amendment: ConsultationAmendment): void {
    this.db
      .insert(consultationAmendments)
      .values({
        id: amendment.id,
        consultationId: amendment.consultationId,
        reason: amendment.reason,
        content: amendment.content,
        createdAt: amendment.createdAt,
      })
      .run();
  }

  listAmendments(consultationId: string): ConsultationAmendment[] {
    return this.db
      .select()
      .from(consultationAmendments)
      .where(eq(consultationAmendments.consultationId, consultationId))
      .orderBy(asc(consultationAmendments.createdAt))
      .all()
      .map((row) => ({
        id: row.id,
        consultationId: row.consultationId,
        reason: row.reason,
        content: row.content,
        createdAt: row.createdAt,
      }));
  }
}

type ConsultationRow = typeof consultations.$inferSelect;

function toRow(consultation: Consultation): ConsultationRow {
  return {
    id: consultation.id,
    patientId: consultation.patientId,
    consultationDate: consultation.consultationDate,
    consultationType: consultation.consultationType,
    subjective: consultation.subjective,
    objective: consultation.objective,
    assessment: consultation.assessment,
    plan: consultation.plan,
    status: consultation.status,
    signedAt: consultation.signedAt,
    createdAt: consultation.createdAt,
    updatedAt: consultation.updatedAt,
    version: consultation.version,
  };
}

function toDomain(row: ConsultationRow): Consultation {
  return {
    id: row.id,
    patientId: row.patientId,
    consultationDate: row.consultationDate,
    consultationType: row.consultationType,
    subjective: row.subjective,
    objective: row.objective,
    assessment: row.assessment,
    plan: row.plan,
    status: row.status,
    signedAt: row.signedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
