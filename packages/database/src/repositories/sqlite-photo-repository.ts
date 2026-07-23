import { asc, eq } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { PatientPhoto } from '@ajnutrition/domain';
import type { PhotoRepository } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';
import { patientPhotos } from '../schema-photos';

export class SqlitePhotoRepository implements PhotoRepository {
  private readonly db: BetterSQLite3Database;

  constructor(connection: SqliteDatabase) {
    this.db = drizzle(connection);
  }

  insert(photo: PatientPhoto): void {
    this.db
      .insert(patientPhotos)
      .values({
        id: photo.id,
        patientId: photo.patientId,
        kind: photo.kind,
        capturedAt: photo.capturedAt,
        originalFileName: photo.originalFileName,
        mimeType: photo.mimeType,
        sizeBytes: photo.sizeBytes,
        sha256: photo.sha256,
        storageName: photo.storageName,
        createdAt: photo.createdAt,
      })
      .run();
  }

  findById(id: string): PatientPhoto | null {
    const row = this.db.select().from(patientPhotos).where(eq(patientPhotos.id, id)).get();
    return row ? toDomain(row) : null;
  }

  listByPatient(patientId: string): PatientPhoto[] {
    return this.db
      .select()
      .from(patientPhotos)
      .where(eq(patientPhotos.patientId, patientId))
      .orderBy(asc(patientPhotos.capturedAt), asc(patientPhotos.kind))
      .all()
      .map(toDomain);
  }

  delete(id: string): void {
    this.db.delete(patientPhotos).where(eq(patientPhotos.id, id)).run();
  }
}

type PhotoRow = typeof patientPhotos.$inferSelect;

function toDomain(row: PhotoRow): PatientPhoto {
  return {
    id: row.id,
    patientId: row.patientId,
    kind: row.kind,
    capturedAt: row.capturedAt,
    originalFileName: row.originalFileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    storageName: row.storageName,
    createdAt: row.createdAt,
  };
}
