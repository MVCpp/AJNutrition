export interface AdherenceRecord {
  id: string;
  patientId: string;
  consultationId: string | null;
  recordedAt: string;
  score: number;
  notes: string | null;
  createdAt: string;
}

export interface AdherenceRepository {
  insert(record: AdherenceRecord): void;
  listByPatient(patientId: string): AdherenceRecord[];
}
