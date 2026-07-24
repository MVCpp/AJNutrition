import { desc, eq, inArray } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { MeasurementRepository, MeasurementSessionRecord } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';
import { calculatedValues, measurementSessions, measurementValues } from '../schema-measurements';

export class SqliteMeasurementRepository implements MeasurementRepository {
  private readonly db: BetterSQLite3Database;

  constructor(connection: SqliteDatabase) {
    this.db = drizzle(connection);
  }

  insertSession(session: MeasurementSessionRecord): void {
    this.db
      .insert(measurementSessions)
      .values({
        id: session.id,
        patientId: session.patientId,
        measuredAt: session.measuredAt,
        notes: session.notes,
        consultationId: session.consultationId,
        createdAt: session.createdAt,
      })
      .run();
    for (const [metric, value] of Object.entries(session.values)) {
      this.db
        .insert(measurementValues)
        .values({
          sessionId: session.id,
          metric: metric as keyof MeasurementSessionRecord['values'],
          value,
        })
        .run();
    }
    for (const calc of session.calculated) {
      this.db
        .insert(calculatedValues)
        .values({
          id: calc.id,
          sessionId: session.id,
          formulaId: calc.formulaId,
          formulaVersion: calc.formulaVersion,
          inputsJson: JSON.stringify(calc.inputs),
          rawResult: calc.rawResult,
          roundedResult: calc.roundedResult,
          unit: calc.unit,
          warningsJson: JSON.stringify(calc.warnings),
        })
        .run();
    }
  }

  findById(sessionId: string): MeasurementSessionRecord | null {
    const row = this.db
      .select()
      .from(measurementSessions)
      .where(eq(measurementSessions.id, sessionId))
      .get();
    if (!row) return null;
    return this.hydrate([row])[0] ?? null;
  }

  listByPatient(patientId: string): MeasurementSessionRecord[] {
    const sessions = this.db
      .select()
      .from(measurementSessions)
      .where(eq(measurementSessions.patientId, patientId))
      .orderBy(desc(measurementSessions.measuredAt), desc(measurementSessions.createdAt))
      .all();
    return this.hydrate(sessions);
  }

  private hydrate(
    sessions: Array<typeof measurementSessions.$inferSelect>,
  ): MeasurementSessionRecord[] {
    if (sessions.length === 0) return [];
    const ids = sessions.map((s) => s.id);
    const values = this.db
      .select()
      .from(measurementValues)
      .where(inArray(measurementValues.sessionId, ids))
      .all();
    const calcs = this.db
      .select()
      .from(calculatedValues)
      .where(inArray(calculatedValues.sessionId, ids))
      .all();

    return sessions.map((session) => ({
      id: session.id,
      patientId: session.patientId,
      measuredAt: session.measuredAt,
      notes: session.notes,
      consultationId: session.consultationId,
      createdAt: session.createdAt,
      values: Object.fromEntries(
        values.filter((v) => v.sessionId === session.id).map((v) => [v.metric, v.value]),
      ),
      calculated: calcs
        .filter((c) => c.sessionId === session.id)
        .map((c) => ({
          id: c.id,
          formulaId: c.formulaId,
          formulaVersion: c.formulaVersion,
          inputs: JSON.parse(c.inputsJson) as Record<string, number | string>,
          rawResult: c.rawResult,
          roundedResult: c.roundedResult,
          unit: c.unit,
          warnings: JSON.parse(c.warningsJson) as string[],
        })),
    }));
  }
}
