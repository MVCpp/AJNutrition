import type { PractitionerProfileRecord, ProfileRepository } from '@ajnutrition/application';
import type { SqliteDatabase } from '../connection';

/** Single-row table — plain SQL is clearer than Drizzle for an upsert-by-1. */
export class SqliteProfileRepository implements ProfileRepository {
  constructor(private readonly db: SqliteDatabase) {}

  get(): PractitionerProfileRecord | null {
    const row = this.db
      .prepare(
        `SELECT full_name, title, license, phone, email, address, logo_base64, logo_mime, updated_at
         FROM practitioner_profile WHERE id = 1`,
      )
      .get() as
      | {
          full_name: string;
          title: string | null;
          license: string | null;
          phone: string | null;
          email: string | null;
          address: string | null;
          logo_base64: string | null;
          logo_mime: 'image/png' | 'image/jpeg' | null;
          updated_at: string;
        }
      | undefined;
    if (!row) return null;
    return {
      fullName: row.full_name,
      title: row.title,
      license: row.license,
      phone: row.phone,
      email: row.email,
      address: row.address,
      logoBase64: row.logo_base64,
      logoMime: row.logo_mime,
      updatedAt: row.updated_at,
    };
  }

  save(record: PractitionerProfileRecord): void {
    this.db
      .prepare(
        `INSERT INTO practitioner_profile
           (id, full_name, title, license, phone, email, address, logo_base64, logo_mime, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           full_name = excluded.full_name, title = excluded.title, license = excluded.license,
           phone = excluded.phone, email = excluded.email, address = excluded.address,
           logo_base64 = excluded.logo_base64, logo_mime = excluded.logo_mime,
           updated_at = excluded.updated_at`,
      )
      .run(
        record.fullName,
        record.title,
        record.license,
        record.phone,
        record.email,
        record.address,
        record.logoBase64,
        record.logoMime,
        record.updatedAt,
      );
  }
}
