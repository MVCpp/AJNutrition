import type {
  AuthStatusDto,
  RecoveryUnlockCommand,
  RecoveryUnlockResult,
  SetupCommand,
  SetupResult,
  UnlockCommand,
} from './contracts/auth';
import type {
  CreateBackupCommand,
  CreateBackupResultDto,
  PreviewBackupResultDto,
  RestoreBackupCommand,
  RestoreBackupResultDto,
} from './contracts/backup';
import type {
  AmendConsultationCommand,
  ConsultationDto,
  CreateConsultationCommand,
  ListConsultationsQuery,
  SignConsultationCommand,
} from './contracts/consultation';
import type {
  AddHistoryEntryCommand,
  HistoryEntryDto,
  ListHistoryQuery,
} from './contracts/clinical-history';
import type {
  ConsentDto,
  ListConsentsQuery,
  RecordConsentCommand,
  WithdrawConsentCommand,
} from './contracts/consent';
import type {
  CreatePatientCommand,
  GetPatientQuery,
  ListPatientsQuery,
  PatientDto,
} from './contracts/patient';
import type { IpcResult } from './result';

/**
 * The complete API surface the preload script exposes as `window.ajnutrition`.
 * Narrow business capabilities only — never generic invoke/send, file paths,
 * SQL, or shell access.
 */
export interface AjnApi {
  auth: {
    getStatus(): Promise<IpcResult<AuthStatusDto>>;
    setup(command: SetupCommand): Promise<IpcResult<SetupResult>>;
    unlock(command: UnlockCommand): Promise<IpcResult<AuthStatusDto>>;
    unlockWithRecovery(command: RecoveryUnlockCommand): Promise<IpcResult<RecoveryUnlockResult>>;
    lock(): Promise<IpcResult<AuthStatusDto>>;
    /** Subscribes to lock/unlock pushes from the main process. Returns unsubscribe. */
    onStatusChanged(listener: (status: AuthStatusDto) => void): () => void;
  };
  backup: {
    /** Opens a native save dialog in the main process; requires unlocked. */
    create(command: CreateBackupCommand): Promise<IpcResult<CreateBackupResultDto>>;
    /** Opens a native open dialog; returns metadata + a single-use restore token. */
    preview(): Promise<IpcResult<PreviewBackupResultDto>>;
    restore(command: RestoreBackupCommand): Promise<IpcResult<RestoreBackupResultDto>>;
  };
  patient: {
    create(command: CreatePatientCommand): Promise<IpcResult<PatientDto>>;
    list(query: ListPatientsQuery): Promise<IpcResult<PatientDto[]>>;
    get(query: GetPatientQuery): Promise<IpcResult<PatientDto>>;
  };
  consultation: {
    create(command: CreateConsultationCommand): Promise<IpcResult<ConsultationDto>>;
    list(query: ListConsultationsQuery): Promise<IpcResult<ConsultationDto[]>>;
    sign(command: SignConsultationCommand): Promise<IpcResult<ConsultationDto>>;
    amend(command: AmendConsultationCommand): Promise<IpcResult<ConsultationDto>>;
  };
  history: {
    add(command: AddHistoryEntryCommand): Promise<IpcResult<HistoryEntryDto>>;
    list(query: ListHistoryQuery): Promise<IpcResult<HistoryEntryDto[]>>;
  };
  consent: {
    record(command: RecordConsentCommand): Promise<IpcResult<ConsentDto>>;
    withdraw(command: WithdrawConsentCommand): Promise<IpcResult<ConsentDto>>;
    list(query: ListConsentsQuery): Promise<IpcResult<ConsentDto[]>>;
  };
}
