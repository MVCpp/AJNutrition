import { and, eq, max, ne, sql } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Patient } from '@ajnutrition/domain';
import type { PatientRepository, PatientSearchCriteria } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';
import { patients } from '../schema';

export class SqlitePatientRepository implements PatientRepository {
  private readonly db: BetterSQLite3Database;

  constructor(connection: SqliteDatabase) {
    this.db = drizzle(connection);
  }

  insert(patient: Patient): void {
    this.db.insert(patients).values({
      id: patient.id,
      fileNumber: patient.fileNumber,
      firstName: patient.firstName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth,
      sexAtBirth: patient.sexAtBirth,
      email: patient.email,
      phone: patient.phone,
      status: patient.status,
      createdAt: patient.createdAt,
      updatedAt: patient.updatedAt,
      version: patient.version,
    }).run();
  }

  findById(id: string): Patient | null {
    const row = this.db.select().from(patients).where(eq(patients.id, id)).get();
    return row ? toDomain(row) : null;
  }

  search(criteria: PatientSearchCriteria): Patient[] {
    const filters = [];
    if (!criteria.includeArchived) {
      filters.push(ne(patients.status, 'archived'));
    }
    if (criteria.search && criteria.search.length > 0) {
      // Escape LIKE wildcards from user input; accent-insensitive search
      // arrives with the FTS work in Phase 4 (see backlog).
      const escaped = criteria.search.replace(/([%_\\])/g, '\\$1').toLowerCase();
      const pattern = `%${escaped}%`;
      filters.push(
        sql`lower(${patients.firstName} || ' ' || ${patients.lastName}) LIKE ${pattern} ESCAPE '\\'`,
      );
    }
    const rows = this.db
      .select()
      .from(patients)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(patients.lastName, patients.firstName)
      .limit(500)
      .all();
    return rows.map(toDomain);
  }

  nextFileNumber(): number {
    const row = this.db.select({ maxFileNumber: max(patients.fileNumber) }).from(patients).get();
    return (row?.maxFileNumber ?? 0) + 1;
  }

  existsDuplicate(firstName: string, lastName: string, dateOfBirth: string): boolean {
    const row = this.db
      .select({ id: patients.id })
      .from(patients)
      .where(
        and(
          ne(patients.status, 'archived'),
          eq(patients.dateOfBirth, dateOfBirth),
          sql`lower(${patients.firstName}) = ${firstName.toLowerCase()}`,
          sql`lower(${patients.lastName}) = ${lastName.toLowerCase()}`,
        ),
      )
      .get();
    return row !== undefined;
  }
}

type PatientRow = typeof patients.$inferSelect;

function toDomain(row: PatientRow): Patient {
  return {
    id: row.id,
    fileNumber: row.fileNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    dateOfBirth: row.dateOfBirth,
    sexAtBirth: row.sexAtBirth,
    email: row.email,
    phone: row.phone,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
