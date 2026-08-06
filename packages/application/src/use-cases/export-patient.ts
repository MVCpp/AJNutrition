import type { DomainContext } from '@ajnutrition/domain';
import {
  AppError,
  PATIENT_EXPORT_FORMAT,
  PATIENT_EXPORT_FORMAT_VERSION,
  type ConsentDto,
  type ConsultationDto,
  type ExportPatientCommand,
  type HistoryEntryDto,
  type MeasurementSessionDto,
  type CoachShareGrantDto,
  type PatientCoachLinkDto,
  type PatientDto,
  type PhotoDto,
} from '@ajnutrition/shared';
import type { AuditLog } from '../ports/audit-log';
import type { PatientRepository } from '../ports/patient-repository';
import { toPatientDto } from '../mappers/patient-mapper';
import type { ListConsentsUseCase } from './consents';
import type { ListConsultationsUseCase } from './consultations';
import type { ListHistoryUseCase } from './clinical-history';
import type { ListMeasurementSessionsUseCase } from './measurements';
import type { GetPatientPhotoDataUseCase, ListPatientPhotosUseCase } from './photos';
import type { GetPatientSharingUseCase, ListPatientCoachLinksUseCase } from './coaches';

/**
 * Structured patient export (§23.1; privacy §10 data-export request).
 * Produces a self-describing READABLE document — this is the data-portability
 * artifact a patient may legally request (ARCO access). It is deliberately
 * NOT encrypted; the manifest says so and carries a sensitivity warning.
 * Encrypted full-application transfer is what backups are for.
 */
export interface PatientExportDocument {
  format: typeof PATIENT_EXPORT_FORMAT;
  formatVersion: typeof PATIENT_EXPORT_FORMAT_VERSION;
  createdAt: string;
  appVersion: string;
  encryption: 'none';
  sensitivityWarning: string;
  included: string[];
  excluded: string[];
  patient: PatientDto;
  consultations: ConsultationDto[];
  clinicalHistory: HistoryEntryDto[];
  consents: ConsentDto[];
  measurements: MeasurementSessionDto[];
  /** Progress photos with the image embedded — the export is self-contained. */
  photos: Array<PhotoDto & { dataBase64: string }>;
  /**
   * Who the practice recorded as this patient's trainer, past and present.
   * Personal data about the patient, so an ARCO access request must surface
   * it; a coach's own contact details and commercial notes are NOT included,
   * because those are the coach's, not the patient's.
   */
  coachLinks: PatientCoachLinkDto[];
  /**
   * Every authorisation ever made to share this patient's progress with a
   * coach, with its live effectiveness. This is the answer to "who has been
   * allowed to see my data?", which is an ARCO access right — leaving it out
   * would make the export incomplete in exactly the way that matters most.
   */
  coachShareGrants: CoachShareGrantDto[];
}

export interface ExportPatientDeps {
  patients: PatientRepository;
  listConsultations: ListConsultationsUseCase;
  listHistory: ListHistoryUseCase;
  listConsents: ListConsentsUseCase;
  listMeasurements: ListMeasurementSessionsUseCase;
  listPhotos: ListPatientPhotosUseCase;
  getPhotoData: GetPatientPhotoDataUseCase;
  listCoachLinks: ListPatientCoachLinksUseCase;
  getSharing: GetPatientSharingUseCase;
  toBase64: (bytes: Uint8Array) => string;
  audit: AuditLog;
  ctx: DomainContext;
  appVersion: string;
}

export class ExportPatientUseCase {
  constructor(private readonly deps: ExportPatientDeps) {}

  execute(command: ExportPatientCommand): PatientExportDocument {
    const {
      patients,
      listConsultations,
      listHistory,
      listConsents,
      listMeasurements,
      listPhotos,
      getPhotoData,
      listCoachLinks,
      getSharing,
      toBase64,
      audit,
      ctx,
      appVersion,
    } = this.deps;
    const patient = patients.findById(command.patientId);
    if (patient === null) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Paciente no encontrado.' });
    }

    const consultations = listConsultations.execute({ patientId: patient.id });
    const clinicalHistory = listHistory.execute({
      patientId: patient.id,
      includeSuperseded: true,
    });
    const consents = listConsents.execute({ patientId: patient.id });
    const measurements = listMeasurements.execute({ patientId: patient.id });
    const photos = listPhotos.execute({ patientId: patient.id }).map((photo) => ({
      ...photo,
      dataBase64: toBase64(getPhotoData.execute({ photoId: photo.id }).bytes),
    }));

    const coachLinks = listCoachLinks.execute({ patientId: patient.id });
    const coachShareGrants = getSharing.execute({ patientId: patient.id }).grants;

    const document: PatientExportDocument = {
      format: PATIENT_EXPORT_FORMAT,
      formatVersion: PATIENT_EXPORT_FORMAT_VERSION,
      createdAt: ctx.now().toISOString(),
      appVersion,
      encryption: 'none',
      sensitivityWarning:
        'Este archivo contiene información personal y clínica sensible SIN CIFRAR. ' +
        'Manéjelo, transpórtelo y elimínelo con el mismo cuidado que un expediente clínico impreso.',
      included: [
        'patient',
        'consultations',
        'clinicalHistory',
        'consents',
        'measurements',
        'photos',
        'coachLinks',
        'coachShareGrants',
      ],
      excluded: ['auditEvents', 'mealPlans', 'coachContactDetails'],
      patient: toPatientDto(patient),
      consultations,
      clinicalHistory,
      consents,
      measurements,
      photos,
      coachLinks,
      coachShareGrants,
    };

    audit.record({
      action: 'patient.export',
      entityType: 'patient',
      entityId: patient.id,
      result: 'success',
      metadata: {
        consultations: consultations.length,
        historyEntries: clinicalHistory.length,
        consents: consents.length,
        measurements: measurements.length,
        photos: photos.length,
        coachLinks: coachLinks.length,
        coachShareGrants: coachShareGrants.length,
      },
    });

    return document;
  }
}
