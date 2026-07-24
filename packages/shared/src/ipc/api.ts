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
  AppointmentDto,
  CreateAppointmentCommand,
  ListAgendaQuery,
  RescheduleAppointmentCommand,
  ResolveAppointmentCommand,
} from './contracts/appointment';
import type {
  AmendConsultationCommand,
  ConsultationDto,
  CreateConsultationCommand,
  UpdateConsultationCommand,
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
import type { ExportPatientCommand, ExportPatientResultDto } from './contracts/patient-export';
import type {
  AddPhotoCommand,
  AddPhotoResultDto,
  DeletePhotoCommand,
  GetPhotoQuery,
  ListPhotosQuery,
  PhotoDataDto,
  PhotoDto,
} from './contracts/photo';
import type {
  CreateMeasurementCommand,
  ListMeasurementsQuery,
  MeasurementSessionDto,
} from './contracts/measurement';
import type {
  CreateFoodCommand,
  ImportFoodsResultDto,
  SetFoodAllergensCommand,
  UpdateFoodCommand,
  FoodDto,
  FoodServingDto,
  SearchFoodsQuery,
} from './contracts/food';
import type {
  AddFoodServingCommand,
  CreateRecipeCommand,
  UpdateRecipeCommand,
  RecipeDto,
  SearchRecipesQuery,
} from './contracts/recipe';
import type {
  AddPlanItemCommand,
  CopyPlanDayCommand,
  CreateMealPlanCommand,
  GetMealPlanQuery,
  ListMealPlansQuery,
  MealPlanDto,
  MealPlanSummaryDto,
  RemovePlanItemCommand,
  SetPlanStatusCommand,
  ReplacePlanItemCommand,
  ShoppingListDto,
  ShoppingListQuery,
  SubstituteSuggestionsDto,
  SuggestSubstitutesQuery,
} from './contracts/meal-plan';
import type {
  ExportPlanPdfCommand,
  ExportPlanPdfResultDto,
  ProfileDto,
  SaveProfileCommand,
  SetLogoResultDto,
} from './contracts/profile';
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
    /** Opens a native save dialog in main; writes the readable JSON export. */
    export(command: ExportPatientCommand): Promise<IpcResult<ExportPatientResultDto>>;
  };
  appointment: {
    create(command: CreateAppointmentCommand): Promise<IpcResult<AppointmentDto>>;
    reschedule(command: RescheduleAppointmentCommand): Promise<IpcResult<AppointmentDto>>;
    resolve(command: ResolveAppointmentCommand): Promise<IpcResult<AppointmentDto>>;
    agenda(query: ListAgendaQuery): Promise<IpcResult<AppointmentDto[]>>;
  };
  consultation: {
    create(command: CreateConsultationCommand): Promise<IpcResult<ConsultationDto>>;
    update(command: UpdateConsultationCommand): Promise<IpcResult<ConsultationDto>>;
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
  food: {
    create(command: CreateFoodCommand): Promise<IpcResult<FoodDto>>;
    update(command: UpdateFoodCommand): Promise<IpcResult<FoodDto>>;
    setAllergens(command: SetFoodAllergensCommand): Promise<IpcResult<FoodDto>>;
    /** Opens a native file dialog; imports foods per 100 g with row-level report. */
    importCsv(): Promise<IpcResult<ImportFoodsResultDto>>;
    search(query: SearchFoodsQuery): Promise<IpcResult<FoodDto[]>>;
    addServing(command: AddFoodServingCommand): Promise<IpcResult<FoodServingDto>>;
  };
  recipe: {
    create(command: CreateRecipeCommand): Promise<IpcResult<RecipeDto>>;
    update(command: UpdateRecipeCommand): Promise<IpcResult<RecipeDto>>;
    search(query: SearchRecipesQuery): Promise<IpcResult<RecipeDto[]>>;
  };
  plan: {
    create(command: CreateMealPlanCommand): Promise<IpcResult<MealPlanDto>>;
    addItem(command: AddPlanItemCommand): Promise<IpcResult<MealPlanDto>>;
    removeItem(command: RemovePlanItemCommand): Promise<IpcResult<MealPlanDto>>;
    get(query: GetMealPlanQuery): Promise<IpcResult<MealPlanDto>>;
    list(query: ListMealPlansQuery): Promise<IpcResult<MealPlanSummaryDto[]>>;
    setStatus(command: SetPlanStatusCommand): Promise<IpcResult<MealPlanDto>>;
    copyDay(command: CopyPlanDayCommand): Promise<IpcResult<MealPlanDto>>;
    shoppingList(query: ShoppingListQuery): Promise<IpcResult<ShoppingListDto>>;
    substitutes(query: SuggestSubstitutesQuery): Promise<IpcResult<SubstituteSuggestionsDto>>;
    replaceItem(command: ReplacePlanItemCommand): Promise<IpcResult<MealPlanDto>>;
    /** Opens a native save dialog; optionally embeds a photo session. */
    exportPdf(command: ExportPlanPdfCommand): Promise<IpcResult<ExportPlanPdfResultDto>>;
  };
  profile: {
    get(): Promise<IpcResult<ProfileDto | null>>;
    save(command: SaveProfileCommand): Promise<IpcResult<ProfileDto>>;
    /** Opens a native file dialog for the logo (JPEG/PNG, max 1 MB). */
    setLogo(): Promise<IpcResult<SetLogoResultDto>>;
  };
  measurement: {
    create(command: CreateMeasurementCommand): Promise<IpcResult<MeasurementSessionDto>>;
    list(query: ListMeasurementsQuery): Promise<IpcResult<MeasurementSessionDto[]>>;
  };
  photo: {
    /** Opens a native file dialog in main; requires active photo consent. */
    add(command: AddPhotoCommand): Promise<IpcResult<AddPhotoResultDto>>;
    list(query: ListPhotosQuery): Promise<IpcResult<PhotoDto[]>>;
    get(query: GetPhotoQuery): Promise<IpcResult<PhotoDataDto>>;
    delete(command: DeletePhotoCommand): Promise<IpcResult<{ deleted: boolean }>>;
  };
}
