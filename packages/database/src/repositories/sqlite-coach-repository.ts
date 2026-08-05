import { and, asc, count, eq, isNull, ne, sql } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Coach, PatientCoachLink } from '@ajnutrition/domain';
import { AppError } from '@ajnutrition/shared';
import type { CoachRepository, CoachSearchCriteria } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';
import { coaches, patientCoachLinks } from '../schema-coaches';

/** Same safety valve as the patient list: a bound far above any real practice. */
const MAX_SEARCH_ROWS = 5000;

export class SqliteCoachRepository implements CoachRepository {
  private readonly db: BetterSQLite3Database;

  constructor(connection: SqliteDatabase) {
    this.db = drizzle(connection);
  }

  insert(coach: Coach): void {
    this.db.insert(coaches).values(toRow(coach)).run();
  }

  update(coach: Coach): void {
    const result = this.db
      .update(coaches)
      .set({
        displayName: coach.displayName,
        organization: coach.organization,
        email: coach.email,
        phone: coach.phone,
        notes: coach.notes,
        status: coach.status,
        updatedAt: coach.updatedAt,
        archivedAt: coach.archivedAt,
        version: coach.version,
      })
      .where(and(eq(coaches.id, coach.id), eq(coaches.version, coach.version - 1)))
      .run();
    if (result.changes === 0) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'El entrenador fue modificado por otra operación. Recargue e intente de nuevo.',
      });
    }
  }

  findById(id: string): Coach | null {
    const row = this.db.select().from(coaches).where(eq(coaches.id, id)).get();
    return row ? toDomain(row) : null;
  }

  search(criteria: CoachSearchCriteria): Coach[] {
    const filters = [];
    if (!criteria.includeArchived) {
      filters.push(ne(coaches.status, 'archived'));
    }
    if (criteria.search && criteria.search.length > 0) {
      const escaped = criteria.search.replace(/([%_\\])/g, '\\$1').toLowerCase();
      const pattern = `%${escaped}%`;
      filters.push(
        sql`lower(${coaches.displayName} || ' ' || coalesce(${coaches.organization}, '')) LIKE ${pattern} ESCAPE '\\'`,
      );
    }
    return this.db
      .select()
      .from(coaches)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(coaches.displayName)
      .limit(MAX_SEARCH_ROWS)
      .all()
      .map(toDomain);
  }

  existsWithName(displayName: string, excludeId?: string): boolean {
    const row = this.db
      .select({ id: coaches.id })
      .from(coaches)
      .where(
        and(
          excludeId === undefined ? undefined : ne(coaches.id, excludeId),
          ne(coaches.status, 'archived'),
          sql`lower(${coaches.displayName}) = ${displayName.toLowerCase()}`,
        ),
      )
      .get();
    return row !== undefined;
  }

  insertLink(link: PatientCoachLink): void {
    this.db.insert(patientCoachLinks).values(toLinkRow(link)).run();
  }

  applyLinkRevocation(link: PatientCoachLink): void {
    const result = this.db
      .update(patientCoachLinks)
      .set({ revokedAt: link.revokedAt, revokedReason: link.revokedReason })
      .where(and(eq(patientCoachLinks.id, link.id), isNull(patientCoachLinks.revokedAt)))
      .run();
    if (result.changes === 0) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Esta vinculación ya fue retirada.',
      });
    }
  }

  findLinkById(id: string): PatientCoachLink | null {
    const row = this.db.select().from(patientCoachLinks).where(eq(patientCoachLinks.id, id)).get();
    return row ? toLinkDomain(row) : null;
  }

  activeLinkForPatient(patientId: string): PatientCoachLink | null {
    const row = this.db
      .select()
      .from(patientCoachLinks)
      .where(and(eq(patientCoachLinks.patientId, patientId), isNull(patientCoachLinks.revokedAt)))
      .get();
    return row ? toLinkDomain(row) : null;
  }

  listLinksForPatient(patientId: string): PatientCoachLink[] {
    return this.db
      .select()
      .from(patientCoachLinks)
      .where(eq(patientCoachLinks.patientId, patientId))
      .orderBy(asc(patientCoachLinks.linkedAt))
      .all()
      .map(toLinkDomain);
  }

  listActiveLinksForCoach(coachId: string): PatientCoachLink[] {
    return this.db
      .select()
      .from(patientCoachLinks)
      .where(and(eq(patientCoachLinks.coachId, coachId), isNull(patientCoachLinks.revokedAt)))
      .orderBy(asc(patientCoachLinks.linkedAt))
      .all()
      .map(toLinkDomain);
  }

  activeTraineeCounts(): Map<string, number> {
    const rows = this.db
      .select({ coachId: patientCoachLinks.coachId, total: count() })
      .from(patientCoachLinks)
      .where(isNull(patientCoachLinks.revokedAt))
      .groupBy(patientCoachLinks.coachId)
      .all();
    return new Map(rows.map((row) => [row.coachId, row.total]));
  }
}

type CoachRow = typeof coaches.$inferSelect;
type LinkRow = typeof patientCoachLinks.$inferSelect;

function toRow(coach: Coach): CoachRow {
  return {
    id: coach.id,
    displayName: coach.displayName,
    organization: coach.organization,
    email: coach.email,
    phone: coach.phone,
    notes: coach.notes,
    status: coach.status,
    createdAt: coach.createdAt,
    updatedAt: coach.updatedAt,
    archivedAt: coach.archivedAt,
    version: coach.version,
  };
}

function toDomain(row: CoachRow): Coach {
  return {
    id: row.id,
    displayName: row.displayName,
    organization: row.organization,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
    version: row.version,
  };
}

function toLinkRow(link: PatientCoachLink): LinkRow {
  return {
    id: link.id,
    patientId: link.patientId,
    coachId: link.coachId,
    linkedAt: link.linkedAt,
    revokedAt: link.revokedAt,
    revokedReason: link.revokedReason,
    createdAt: link.createdAt,
  };
}

function toLinkDomain(row: LinkRow): PatientCoachLink {
  return {
    id: row.id,
    patientId: row.patientId,
    coachId: row.coachId,
    linkedAt: row.linkedAt,
    revokedAt: row.revokedAt,
    revokedReason: row.revokedReason,
    createdAt: row.createdAt,
  };
}
