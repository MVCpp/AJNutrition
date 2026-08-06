import { and, asc, eq, isNull } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { CoachShareGrant } from '@ajnutrition/domain';
import { AppError } from '@ajnutrition/shared';
import type { CoachShareRepository } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';
import { coachShareGrants, patientCoachLinks } from '../schema-coaches';

export class SqliteCoachShareRepository implements CoachShareRepository {
  private readonly db: BetterSQLite3Database;

  constructor(connection: SqliteDatabase) {
    this.db = drizzle(connection);
  }

  insertGrant(grant: CoachShareGrant): void {
    this.db.insert(coachShareGrants).values(toRow(grant)).run();
  }

  applyGrantRevocation(grant: CoachShareGrant): void {
    const result = this.db
      .update(coachShareGrants)
      .set({ revokedAt: grant.revokedAt, revokedReason: grant.revokedReason })
      .where(and(eq(coachShareGrants.id, grant.id), isNull(coachShareGrants.revokedAt)))
      .run();
    if (result.changes === 0) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Esta autorización ya fue retirada.',
      });
    }
  }

  findGrantById(id: string): CoachShareGrant | null {
    const row = this.db.select().from(coachShareGrants).where(eq(coachShareGrants.id, id)).get();
    return row ? toDomain(row) : null;
  }

  liveGrantForLink(linkId: string): CoachShareGrant | null {
    const row = this.db
      .select()
      .from(coachShareGrants)
      .where(and(eq(coachShareGrants.linkId, linkId), isNull(coachShareGrants.revokedAt)))
      .get();
    return row ? toDomain(row) : null;
  }

  /**
   * Joined through the referral links so this returns every grant ever made
   * about this patient, including ones whose link was later revoked. The
   * patient is entitled to the history, not the current state — this is what
   * answers "who has been allowed to see my data?".
   */
  listGrantsForPatient(patientId: string): CoachShareGrant[] {
    return this.db
      .select({ grant: coachShareGrants })
      .from(coachShareGrants)
      .innerJoin(patientCoachLinks, eq(patientCoachLinks.id, coachShareGrants.linkId))
      .where(eq(patientCoachLinks.patientId, patientId))
      .orderBy(asc(coachShareGrants.grantedAt))
      .all()
      .map((row) => toDomain(row.grant));
  }

  consentAlreadyUsed(consentId: string): boolean {
    const row = this.db
      .select({ id: coachShareGrants.id })
      .from(coachShareGrants)
      .where(eq(coachShareGrants.consentId, consentId))
      .get();
    return row !== undefined;
  }
}

type GrantRow = typeof coachShareGrants.$inferSelect;

function toRow(grant: CoachShareGrant): GrantRow {
  return {
    id: grant.id,
    linkId: grant.linkId,
    consentId: grant.consentId,
    shareMeasurements: grant.scope.measurements,
    shareBodyComposition: grant.scope.bodyComposition,
    sharePlanTargets: grant.scope.planTargets,
    shareAdherence: grant.scope.adherence,
    sharePhotos: grant.scope.photos,
    grantedAt: grant.grantedAt,
    revokedAt: grant.revokedAt,
    revokedReason: grant.revokedReason,
    createdAt: grant.createdAt,
  };
}

function toDomain(row: GrantRow): CoachShareGrant {
  return {
    id: row.id,
    linkId: row.linkId,
    consentId: row.consentId,
    scope: {
      measurements: row.shareMeasurements,
      bodyComposition: row.shareBodyComposition,
      planTargets: row.sharePlanTargets,
      adherence: row.shareAdherence,
      photos: row.sharePhotos,
    },
    grantedAt: row.grantedAt,
    revokedAt: row.revokedAt,
    revokedReason: row.revokedReason,
    createdAt: row.createdAt,
  };
}
