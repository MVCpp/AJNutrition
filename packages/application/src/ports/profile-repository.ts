export interface PractitionerProfileRecord {
  fullName: string;
  title: string | null;
  license: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  logoBase64: string | null;
  logoMime: 'image/png' | 'image/jpeg' | null;
  updatedAt: string;
}

export interface ProfileRepository {
  get(): PractitionerProfileRecord | null;
  save(record: PractitionerProfileRecord): void;
}
