import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Appointment } from '@ajnutrition/domain';
import type { AppointmentRepository, AppointmentWithPatient } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';
import { appointments } from '../schema-appointments';
import { patients } from '../schema';

export class SqliteAppointmentRepository implements AppointmentRepository {
  private readonly db: BetterSQLite3Database;

  constructor(connection: SqliteDatabase) {
    this.db = drizzle(connection);
  }

  insert(appointment: Appointment): void {
    this.db
      .insert(appointments)
      .values({ ...appointment })
      .run();
  }

  update(appointment: Appointment): void {
    this.db
      .update(appointments)
      .set({
        scheduledAt: appointment.scheduledAt,
        durationMinutes: appointment.durationMinutes,
        reason: appointment.reason,
        status: appointment.status,
        consultationId: appointment.consultationId,
        updatedAt: appointment.updatedAt,
      })
      .where(eq(appointments.id, appointment.id))
      .run();
  }

  findById(id: string): Appointment | null {
    const row = this.db.select().from(appointments).where(eq(appointments.id, id)).get();
    return row ? { ...row } : null;
  }

  listBetween(fromDate: string, toDate: string): AppointmentWithPatient[] {
    return this.db
      .select({
        appointment: appointments,
        firstName: patients.firstName,
        lastName: patients.lastName,
      })
      .from(appointments)
      .innerJoin(patients, eq(patients.id, appointments.patientId))
      .where(
        and(
          gte(appointments.scheduledAt, `${fromDate}T00:00`),
          lte(appointments.scheduledAt, `${toDate}T23:59`),
        ),
      )
      .orderBy(asc(appointments.scheduledAt), asc(sql`${patients.lastName}`))
      .all()
      .map((row) => ({
        appointment: { ...row.appointment },
        patientName: `${row.firstName} ${row.lastName}`,
      }));
  }
}
