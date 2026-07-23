import {
  createPatientPhoto,
  currentConsentByType,
  type DomainContext,
  type PatientPhoto,
} from '@ajnutrition/domain';
import {
  AppError,
  type DeletePhotoCommand,
  type GetPhotoQuery,
  type ListPhotosQuery,
  type PhotoDto,
} from '@ajnutrition/shared';
import type { AuditLog } from '../ports/audit-log';
import type { ConsentRepository } from '../ports/consent-repository';
import type { PatientRepository } from '../ports/patient-repository';
import type { PhotoRepository, PhotoStorage } from '../ports/photo-repository';
import type { UnitOfWork } from '../ports/unit-of-work';

export interface PhotoDeps {
  uow: UnitOfWork;
  photos: PhotoRepository;
  storage: PhotoStorage;
  patients: PatientRepository;
  consents: ConsentRepository;
  audit: AuditLog;
  ctx: DomainContext;
  /** Injected so the application layer stays free of node:crypto. */
  sha256: (bytes: Uint8Array) => string;
}

function toDto(photo: PatientPhoto): PhotoDto {
  return {
    id: photo.id,
    patientId: photo.patientId,
    kind: photo.kind,
    capturedAt: photo.capturedAt,
    mimeType: photo.mimeType,
    sizeBytes: photo.sizeBytes,
    createdAt: photo.createdAt,
  };
}

export interface AddPhotoInput {
  patientId: string;
  kind: PatientPhoto['kind'];
  capturedAt: string;
  originalFileName: string;
  bytes: Uint8Array;
}

export class AddPatientPhotoUseCase {
  constructor(private readonly deps: PhotoDeps) {}

  execute(input: AddPhotoInput): PhotoDto {
    const { uow, photos, storage, patients, consents, audit, ctx, sha256 } = this.deps;
    if (patients.findById(input.patientId) === null) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Paciente no encontrado.' });
    }

    // §10/§33: body photos require an ACTIVE accepted photo consent.
    const current = currentConsentByType(consents.listByPatient(input.patientId));
    const photoConsent = current.get('photo');
    if (!photoConsent || photoConsent.status !== 'accepted') {
      throw new AppError({
        code: 'AUTHORIZATION',
        message:
          'Se requiere un consentimiento de fotografías vigente. Regístrelo en la pestaña Consentimientos.',
      });
    }

    const photo = createPatientPhoto({ ...input, sha256: sha256(input.bytes) }, ctx);

    // Bytes first: if encryption/writing fails, no metadata row exists.
    storage.save(photo.storageName, input.bytes);
    try {
      return uow.run(() => {
        photos.insert(photo);
        audit.record({
          action: 'photo.add',
          entityType: 'photo',
          entityId: photo.id,
          result: 'success',
          // Kind and size only — never the original file name (may contain
          // the patient's name).
          metadata: { patientId: photo.patientId, kind: photo.kind, sizeBytes: photo.sizeBytes },
        });
        return toDto(photo);
      });
    } catch (err) {
      storage.remove(photo.storageName);
      throw err;
    }
  }
}

export class ListPatientPhotosUseCase {
  constructor(private readonly deps: Pick<PhotoDeps, 'photos'>) {}

  execute(query: ListPhotosQuery): PhotoDto[] {
    return this.deps.photos.listByPatient(query.patientId).map(toDto);
  }
}

export class GetPatientPhotoDataUseCase {
  constructor(private readonly deps: Pick<PhotoDeps, 'photos' | 'storage'>) {}

  execute(query: GetPhotoQuery): { mimeType: PatientPhoto['mimeType']; bytes: Uint8Array } {
    const photo = this.deps.photos.findById(query.photoId);
    if (photo === null) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Fotografía no encontrada.' });
    }
    return { mimeType: photo.mimeType, bytes: this.deps.storage.read(photo.storageName) };
  }
}

export class DeletePatientPhotoUseCase {
  constructor(private readonly deps: Pick<PhotoDeps, 'uow' | 'photos' | 'storage' | 'audit'>) {}

  execute(command: DeletePhotoCommand): void {
    const { uow, photos, storage, audit } = this.deps;
    const photo = photos.findById(command.photoId);
    if (photo === null) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Fotografía no encontrada.' });
    }
    uow.run(() => {
      photos.delete(photo.id);
      audit.record({
        action: 'photo.delete',
        entityType: 'photo',
        entityId: photo.id,
        result: 'success',
        metadata: { patientId: photo.patientId, kind: photo.kind },
      });
    });
    // After the metadata commit; an orphaned encrypted file is harmless,
    // a dangling metadata row is not.
    storage.remove(photo.storageName);
  }
}
