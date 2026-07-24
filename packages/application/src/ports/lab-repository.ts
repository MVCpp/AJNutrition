export interface LabResultRecord {
  id: string;
  patientId: string;
  consultationId: string | null;
  collectedAt: string;
  analyte: string;
  value: number;
  unit: string;
  referenceLow: number | null;
  referenceHigh: number | null;
  createdAt: string;
}

export interface LabRepository {
  insertMany(records: LabResultRecord[]): void;
  listByPatient(patientId: string): LabResultRecord[];
}
