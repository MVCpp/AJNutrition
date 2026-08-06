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
import type { LabEntryDto, ListLabResultsQuery, RecordLabResultsCommand } from './contracts/lab';
import type {
  ActivateLicenseCommand,
  ActivateLicenseResultDto,
  LicenseStatusDto,
} from './contracts/license';
import type {
  AdherenceEntryDto,
  ListAdherenceQuery,
  RecordAdherenceCommand,
} from './contracts/adherence';
import type {
  AiProgressSummaryDto,
  AiSettingsDto,
  GenerateProgressSummaryCommand,
  SaveAiSettingsCommand,
} from './contracts/ai';
import type {
  AppSettingsDto,
  ChooseBackupFolderResultDto,
  SaveAppSettingsCommand,
} from './contracts/app-settings';
import type {
  AmendConsultationCommand,
  ConsultationDto,
  CreateConsultationCommand,
  UpdateConsultationCommand,
  ListConsultationsQuery,
  NoteTemplateDto,
  SaveNoteTemplateCommand,
  DeleteNoteTemplateCommand,
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
  CoachDetailDto,
  CoachDto,
  CoachPackResultDto,
  CoachShareGrantDto,
  ExportCoachPackCommand,
  ExportCoachReportCommand,
  GrantCoachShareCommand,
  ListCoachSharesQuery,
  PatientSharingDto,
  RevokeCoachShareCommand,
  CreateCoachCommand,
  GetCoachQuery,
  GetPatientCoachQuery,
  LinkPatientToCoachCommand,
  ListCoachesQuery,
  PatientCoachLinkDto,
  RevokeCoachLinkCommand,
  SetCoachStatusCommand,
  UpdateCoachCommand,
} from './contracts/coach';
import type {
  CreatePatientCommand,
  UpdatePatientCommand,
  SetPatientStatusCommand,
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
  ExportProgressReportCommand,
  ExportProgressReportResultDto,
  FormulaDriftDto,
  ListMeasurementsQuery,
  MeasurementSessionDto,
} from './contracts/measurement';
import type {
  CreateFoodCommand,
  ImportFoodsResultDto,
  SetFoodAllergensCommand,
  SetFoodStatusCommand,
  SetFoodEquivalenceCommand,
  DeleteFoodEquivalenceCommand,
  UpdateFoodCommand,
  FoodDto,
  FoodServingDto,
  SearchFoodsQuery,
} from './contracts/food';
import type {
  AddFoodServingCommand,
  DeleteFoodServingCommand,
  CreateRecipeCommand,
  UpdateRecipeCommand,
  SetRecipeStatusCommand,
  RecipeDto,
  SearchRecipesQuery,
} from './contracts/recipe';
import type {
  AddPlanItemCommand,
  CopyPlanDayCommand,
  DuplicateMealPlanCommand,
  SetMealDistributionCommand,
  SetEquivalentTargetsCommand,
  ListPlanVersionsQuery,
  PlanVersionDto,
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
    /** Corrects demographic data; the file number is not editable. */
    update(command: UpdatePatientCommand): Promise<IpcResult<PatientDto>>;
    /** Archives or reactivates. Never deletes clinical data. */
    setStatus(command: SetPatientStatusCommand): Promise<IpcResult<PatientDto>>;
    list(query: ListPatientsQuery): Promise<IpcResult<PatientDto[]>>;
    get(query: GetPatientQuery): Promise<IpcResult<PatientDto>>;
    /** Opens a native save dialog in main; writes the readable JSON export. */
    export(command: ExportPatientCommand): Promise<IpcResult<ExportPatientResultDto>>;
  };
  adherence: {
    record(command: RecordAdherenceCommand): Promise<IpcResult<AdherenceEntryDto>>;
    list(query: ListAdherenceQuery): Promise<IpcResult<AdherenceEntryDto[]>>;
  };
  settings: {
    get(): Promise<IpcResult<AppSettingsDto>>;
    save(command: SaveAppSettingsCommand): Promise<IpcResult<AppSettingsDto>>;
    /** Opens a native folder dialog in main and stores the chosen destination. */
    chooseBackupFolder(): Promise<IpcResult<ChooseBackupFolderResultDto>>;
  };
  license: {
    getStatus(): Promise<IpcResult<LicenseStatusDto>>;
    /** Stores a token the practitioner pasted. Verified before it replaces anything. */
    activate(command: ActivateLicenseCommand): Promise<IpcResult<LicenseStatusDto>>;
    /** Opens a native file dialog in main; the renderer never names a path. */
    loadFromFile(): Promise<IpcResult<ActivateLicenseResultDto>>;
  };
  ai: {
    getSettings(): Promise<IpcResult<AiSettingsDto>>;
    saveSettings(command: SaveAiSettingsCommand): Promise<IpcResult<AiSettingsDto>>;
    progressSummary(
      command: GenerateProgressSummaryCommand,
    ): Promise<IpcResult<AiProgressSummaryDto>>;
  };
  lab: {
    record(command: RecordLabResultsCommand): Promise<IpcResult<LabEntryDto[]>>;
    list(query: ListLabResultsQuery): Promise<IpcResult<LabEntryDto[]>>;
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
    /** Reusable SOAP boilerplate, inserted by hand into a consultation. */
    listTemplates(): Promise<IpcResult<NoteTemplateDto[]>>;
    saveTemplate(command: SaveNoteTemplateCommand): Promise<IpcResult<NoteTemplateDto>>;
    deleteTemplate(command: DeleteNoteTemplateCommand): Promise<IpcResult<void>>;
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
  /**
   * Personal trainers who refer trainees, and who trains with whom
   * (docs/product/coach-sharing.md). Record-keeping only: none of these calls
   * sends anything anywhere, and none of them returns clinical data. Sharing a
   * patient's progress with their trainer needs an express consent (C-2).
   */
  coach: {
    create(command: CreateCoachCommand): Promise<IpcResult<CoachDto>>;
    update(command: UpdateCoachCommand): Promise<IpcResult<CoachDto>>;
    /** Archives or restores. Existing links are untouched either way. */
    setStatus(command: SetCoachStatusCommand): Promise<IpcResult<CoachDto>>;
    list(query: ListCoachesQuery): Promise<IpcResult<CoachDto[]>>;
    /** The coach and their current trainees — identity only. */
    get(query: GetCoachQuery): Promise<IpcResult<CoachDetailDto>>;
    link(command: LinkPatientToCoachCommand): Promise<IpcResult<PatientCoachLinkDto>>;
    unlink(command: RevokeCoachLinkCommand): Promise<IpcResult<PatientCoachLinkDto>>;
    /** The patient's current trainer, or null. */
    forPatient(query: GetPatientCoachQuery): Promise<IpcResult<PatientCoachLinkDto | null>>;
    /**
     * Authorises sharing with the trainer. Requires an accepted
     * third_party_transfer consent from the patient; one consent authorises
     * one grant, so it necessarily names one coach.
     */
    grantShare(command: GrantCoachShareCommand): Promise<IpcResult<CoachShareGrantDto>>;
    revokeShare(command: RevokeCoachShareCommand): Promise<IpcResult<CoachShareGrantDto>>;
    /** Every authorisation ever made about this patient, plus usable consents. */
    sharing(query: ListCoachSharesQuery): Promise<IpcResult<PatientSharingDto>>;
    /**
     * Writes the coach's copy of one trainee's progress. Refuses with
     * AUTHORIZATION when there is no effective grant at this instant.
     */
    exportReport(command: ExportCoachReportCommand): Promise<IpcResult<ExportPatientResultDto>>;
    /** One document per authorised trainee, plus who was skipped and why. */
    exportPack(command: ExportCoachPackCommand): Promise<IpcResult<CoachPackResultDto>>;
  };
  food: {
    create(command: CreateFoodCommand): Promise<IpcResult<FoodDto>>;
    update(command: UpdateFoodCommand): Promise<IpcResult<FoodDto>>;
    setAllergens(command: SetFoodAllergensCommand): Promise<IpcResult<FoodDto>>;
    /** Archives or reactivates. Existing plans keep resolving the food. */
    setStatus(command: SetFoodStatusCommand): Promise<IpcResult<FoodDto>>;
    /** SMAE: "one equivalente = N g", from the practitioner's own tables. */
    setEquivalence(command: SetFoodEquivalenceCommand): Promise<IpcResult<FoodDto>>;
    deleteEquivalence(command: DeleteFoodEquivalenceCommand): Promise<IpcResult<FoodDto>>;
    /** Opens a native file dialog; imports foods per 100 g with row-level report. */
    importCsv(): Promise<IpcResult<ImportFoodsResultDto>>;
    /** Bulk-loads SMAE equivalences from the practitioner's own tables. */
    importEquivalences(): Promise<IpcResult<ImportFoodsResultDto>>;
    search(query: SearchFoodsQuery): Promise<IpcResult<FoodDto[]>>;
    /** Household measures: "1 pieza = 30 g". */
    addServing(command: AddFoodServingCommand): Promise<IpcResult<FoodServingDto>>;
    deleteServing(command: DeleteFoodServingCommand): Promise<IpcResult<void>>;
  };
  recipe: {
    create(command: CreateRecipeCommand): Promise<IpcResult<RecipeDto>>;
    update(command: UpdateRecipeCommand): Promise<IpcResult<RecipeDto>>;
    setStatus(command: SetRecipeStatusCommand): Promise<IpcResult<RecipeDto>>;
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
    /** Reuses a plan's structure for another cycle or another patient. */
    duplicate(command: DuplicateMealPlanCommand): Promise<IpcResult<MealPlanDto>>;
    /** Per-meal energy split, in percent of the day. */
    setMealDistribution(command: SetMealDistributionCommand): Promise<IpcResult<MealPlanDto>>;
    /** Prescribed equivalentes per group (SMAE). */
    setEquivalentTargets(command: SetEquivalentTargetsCommand): Promise<IpcResult<MealPlanDto>>;
    /** What the patient was handed, each time the plan was activated. */
    versions(query: ListPlanVersionsQuery): Promise<IpcResult<PlanVersionDto[]>>;
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
    /** Patient-facing progress report; opens a native save dialog in main. */
    exportProgress(
      command: ExportProgressReportCommand,
    ): Promise<IpcResult<ExportProgressReportResultDto>>;
    /** Stored results today's engine would compute differently. Read-only. */
    formulaDrift(): Promise<IpcResult<FormulaDriftDto[]>>;
  };
  photo: {
    /** Opens a native file dialog in main; requires active photo consent. */
    add(command: AddPhotoCommand): Promise<IpcResult<AddPhotoResultDto>>;
    list(query: ListPhotosQuery): Promise<IpcResult<PhotoDto[]>>;
    get(query: GetPhotoQuery): Promise<IpcResult<PhotoDataDto>>;
    delete(command: DeletePhotoCommand): Promise<IpcResult<{ deleted: boolean }>>;
  };
}
