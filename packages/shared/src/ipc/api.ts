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
  patient: {
    create(command: CreatePatientCommand): Promise<IpcResult<PatientDto>>;
    list(query: ListPatientsQuery): Promise<IpcResult<PatientDto[]>>;
    get(query: GetPatientQuery): Promise<IpcResult<PatientDto>>;
  };
}
