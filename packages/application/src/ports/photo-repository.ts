import type { PatientPhoto } from '@ajnutrition/domain';

export interface PhotoRepository {
  insert(photo: PatientPhoto): void;
  findById(id: string): PatientPhoto | null;
  listByPatient(patientId: string): PatientPhoto[];
  delete(id: string): void;
}

/**
 * Opaque encrypted byte storage for attachments. Implementations must
 * encrypt at rest and bind ciphertext to the storage name (main process
 * provides an AES-GCM adapter over the attachments directory).
 */
export interface PhotoStorage {
  save(storageName: string, bytes: Uint8Array): void;
  read(storageName: string): Uint8Array;
  remove(storageName: string): void;
}
