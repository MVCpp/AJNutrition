import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { DomainContext } from '@ajnutrition/domain';
import {
  AddFoodServingUseCase,
  AddPlanItemUseCase,
  AddHistoryEntryUseCase,
  AddPatientPhotoUseCase,
  CreateFoodUseCase,
  UpdateFoodUseCase,
  SetFoodAllergensUseCase,
  ImportFoodsCsvUseCase,
  CreateRecipeUseCase,
  UpdateRecipeUseCase,
  CreateMealPlanUseCase,
  CreateMeasurementSessionUseCase,
  DeletePatientPhotoUseCase,
  ExportPatientUseCase,
  GetPatientPhotoDataUseCase,
  ListMealPlansUseCase,
  ListMeasurementSessionsUseCase,
  SearchFoodsUseCase,
  RemovePlanItemUseCase,
  SearchRecipesUseCase,
  SetProfileLogoUseCase,
  SaveProfileUseCase,
  ListPatientPhotosUseCase,
  ListConsentsUseCase,
  RecordConsentUseCase,
  WithdrawConsentUseCase,
  AmendConsultationUseCase,
  CreateConsultationUseCase,
  UpdateConsultationUseCase,
  CreateAppointmentUseCase,
  RescheduleAppointmentUseCase,
  ResolveAppointmentUseCase,
  ListAgendaUseCase,
  RecordLabResultsUseCase,
  ListLabResultsUseCase,
  RecordAdherenceUseCase,
  ListAdherenceUseCase,
  type AppointmentDeps,
  type LabDeps,
  type AdherenceDeps,
  CreatePatientUseCase,
  GetMealPlanUseCase,
  SetPlanStatusUseCase,
  CopyPlanDayUseCase,
  GenerateShoppingListUseCase,
  SuggestSubstitutesUseCase,
  ReplacePlanItemUseCase,
  GetPatientUseCase,
  GetProfileUseCase,
  ListConsultationsUseCase,
  ListHistoryUseCase,
  ListPatientsUseCase,
  SignConsultationUseCase,
  type AuditLog,
  type ClinicalHistoryDeps,
  type ConsentDeps,
  type ConsultationDeps,
  type FoodDeps,
  type MealPlanDeps,
  type ProfileDeps,
  type ProfileRepository,
  type RecipeDeps,
  type MeasurementDeps,
  type PhotoDeps,
  type AiDeps,
  GetAiSettingsUseCase,
  GetAppSettingsUseCase,
  SaveAppSettingsUseCase,
  RecordAutoBackupRunUseCase,
  SetAutoBackupFolderUseCase,
  type AppSettingsDeps,
  SaveAiSettingsUseCase,
  GenerateAiProgressSummaryUseCase,
} from '@ajnutrition/application';
import {
  assertSchemaNotAhead,
  checkIntegrity,
  FDC_CATALOG_RELEASE,
  openDatabase,
  runMigrations,
  seedFdcCatalog,
  seedMxCatalog,
  MX_CATALOG_RETRIEVED,
  SqliteAuditLog,
  SqliteClinicalHistoryRepository,
  SqliteConsentRepository,
  SqliteConsultationRepository,
  SqliteFoodRepository,
  SqliteFoodServingRepository,
  SqliteRecipeRepository,
  SqliteMealPlanRepository,
  SqliteProfileRepository,
  SqliteAppointmentRepository,
  SqliteLabRepository,
  SqliteAdherenceRepository,
  SqliteAiSettingsRepository,
  SqliteAppSettingsRepository,
  SqliteMeasurementRepository,
  SqlitePhotoRepository,
  SqlitePatientRepository,
  SqliteUnitOfWork,
  type SqliteDatabase,
} from '@ajnutrition/database';
import { AppError } from '@ajnutrition/shared';
import { AnthropicProvider, type AiModel } from '@ajnutrition/ai';
import { openEnvelope, sealEnvelope, type EnvelopeV1 } from '@ajnutrition/security';
import { EncryptedPhotoStorage } from './encrypted-photo-storage';

export interface AppContainer {
  profileRepo: ProfileRepository;
  db: SqliteDatabase;
  audit: AuditLog;
  useCases: {
    createPatient: CreatePatientUseCase;
    listPatients: ListPatientsUseCase;
    getPatient: GetPatientUseCase;
    createConsultation: CreateConsultationUseCase;
    updateConsultation: UpdateConsultationUseCase;
    createAppointment: CreateAppointmentUseCase;
    rescheduleAppointment: RescheduleAppointmentUseCase;
    resolveAppointment: ResolveAppointmentUseCase;
    listAgenda: ListAgendaUseCase;
    recordLabResults: RecordLabResultsUseCase;
    listLabResults: ListLabResultsUseCase;
    recordAdherence: RecordAdherenceUseCase;
    listAdherence: ListAdherenceUseCase;
    getAppSettings: GetAppSettingsUseCase;
    saveAppSettings: SaveAppSettingsUseCase;
    setAutoBackupFolder: SetAutoBackupFolderUseCase;
    recordAutoBackupRun: RecordAutoBackupRunUseCase;
    getAiSettings: GetAiSettingsUseCase;
    saveAiSettings: SaveAiSettingsUseCase;
    generateAiProgressSummary: GenerateAiProgressSummaryUseCase;
    listConsultations: ListConsultationsUseCase;
    signConsultation: SignConsultationUseCase;
    amendConsultation: AmendConsultationUseCase;
    addHistoryEntry: AddHistoryEntryUseCase;
    listHistory: ListHistoryUseCase;
    recordConsent: RecordConsentUseCase;
    withdrawConsent: WithdrawConsentUseCase;
    listConsents: ListConsentsUseCase;
    exportPatient: ExportPatientUseCase;
    addPhoto: AddPatientPhotoUseCase;
    listPhotos: ListPatientPhotosUseCase;
    getPhotoData: GetPatientPhotoDataUseCase;
    deletePhoto: DeletePatientPhotoUseCase;
    createMeasurement: CreateMeasurementSessionUseCase;
    listMeasurements: ListMeasurementSessionsUseCase;
    createFood: CreateFoodUseCase;
    updateFood: UpdateFoodUseCase;
    setFoodAllergens: SetFoodAllergensUseCase;
    importFoodsCsv: ImportFoodsCsvUseCase;
    searchFoods: SearchFoodsUseCase;
    createRecipe: CreateRecipeUseCase;
    updateRecipe: UpdateRecipeUseCase;
    searchRecipes: SearchRecipesUseCase;
    addFoodServing: AddFoodServingUseCase;
    createMealPlan: CreateMealPlanUseCase;
    addPlanItem: AddPlanItemUseCase;
    removePlanItem: RemovePlanItemUseCase;
    getMealPlan: GetMealPlanUseCase;
    setPlanStatus: SetPlanStatusUseCase;
    copyPlanDay: CopyPlanDayUseCase;
    shoppingList: GenerateShoppingListUseCase;
    suggestSubstitutes: SuggestSubstitutesUseCase;
    replacePlanItem: ReplacePlanItemUseCase;
    listMealPlans: ListMealPlansUseCase;
    getProfile: GetProfileUseCase;
    saveProfile: SaveProfileUseCase;
    setProfileLogo: SetProfileLogoUseCase;
  };
}

/**
 * Composition root. Runs at every unlock in the main process:
 * opens the encrypted database, refuses downgrade scenarios, verifies
 * integrity, applies pending migrations, wires repositories and use cases.
 * The AuthManager owns its lifecycle (created on unlock, closed on lock).
 */
const AI_KEY_AAD = 'ajnutrition/ai/api-key/v1';

export function createContainer(
  userDataPath: string,
  appVersion: string,
  dbKeyHex: string,
  attachmentKey: Buffer,
  aiSecretKey: Buffer,
): AppContainer {
  const dataDir = path.join(userDataPath, 'data');
  mkdirSync(dataDir, { recursive: true });
  const db = openDatabase(path.join(dataDir, 'ajnutrition.db3'), dbKeyHex);

  const integrity = checkIntegrity(db);
  if (!integrity.ok) {
    throw new AppError({
      code: 'INTEGRITY',
      message:
        'La base de datos local está dañada. Restaure una copia de seguridad antes de continuar.',
      internalDetail: integrity.detail,
    });
  }

  assertSchemaNotAhead(db);
  runMigrations(db);

  const ctx: DomainContext = {
    now: () => new Date(),
    newId: () => randomUUID(),
  };

  const patients = new SqlitePatientRepository(db);
  const consultations = new SqliteConsultationRepository(db);
  const audit = new SqliteAuditLog(db, { appVersion, now: ctx.now, newId: ctx.newId });

  // Bundled USDA catalog: idempotent, so unlock stays cheap after first run.
  const seededCount = seedFdcCatalog(db, ctx);
  if (seededCount > 0) {
    audit.record({
      action: 'catalog.seed',
      entityType: 'food',
      entityId: null,
      result: 'success',
      metadata: { source: 'fdc', release: FDC_CATALOG_RELEASE, count: seededCount },
    });
  }
  // Bundled CONABIO/INCMNSZ Mexican catalog (CC BY 4.0), same idempotent shape.
  const seededMxCount = seedMxCatalog(db, ctx);
  if (seededMxCount > 0) {
    audit.record({
      action: 'catalog.seed',
      entityType: 'food',
      entityId: null,
      result: 'success',
      metadata: { source: 'mx', release: MX_CATALOG_RETRIEVED, count: seededMxCount },
    });
  }
  const uow = new SqliteUnitOfWork(db);
  const consultationDeps: ConsultationDeps = { uow, consultations, patients, audit, ctx };
  const history = new SqliteClinicalHistoryRepository(db);
  const historyDeps: ClinicalHistoryDeps = { uow, history, patients, audit, ctx };
  const consents = new SqliteConsentRepository(db);
  const consentDeps: ConsentDeps = { uow, consents, patients, audit, ctx };
  const listConsultations = new ListConsultationsUseCase(consultationDeps);
  const listHistory = new ListHistoryUseCase(historyDeps);
  const listConsents = new ListConsentsUseCase(consentDeps);
  const photoStorage = new EncryptedPhotoStorage(
    path.join(userDataPath, 'attachments'),
    attachmentKey,
  );
  const photoDeps: PhotoDeps = {
    uow,
    photos: new SqlitePhotoRepository(db),
    storage: photoStorage,
    patients,
    consents,
    consultations,
    audit,
    ctx,
    sha256: (bytes) => createHash('sha256').update(bytes).digest('hex'),
  };
  const foodRepo = new SqliteFoodRepository(db);
  const servingRepo = new SqliteFoodServingRepository(db);
  const foodDeps: FoodDeps = {
    uow,
    foods: foodRepo,
    servings: servingRepo,
    audit,
    ctx,
  };
  const recipeDeps: RecipeDeps = {
    uow,
    recipes: new SqliteRecipeRepository(db),
    foods: foodRepo,
    servings: servingRepo,
    audit,
    ctx,
  };
  const measurementRepo = new SqliteMeasurementRepository(db);
  const measurementDeps: MeasurementDeps = {
    uow,
    measurements: measurementRepo,
    patients,
    consultations,
    audit,
    ctx,
  };
  const profileRepo = new SqliteProfileRepository(db);
  const profileDeps: ProfileDeps = { uow, profile: profileRepo, audit, ctx };
  const appointmentDeps: AppointmentDeps = {
    uow,
    appointments: new SqliteAppointmentRepository(db),
    patients,
    consultations,
    audit,
    ctx,
  };
  const labDeps: LabDeps = {
    uow,
    labs: new SqliteLabRepository(db),
    patients,
    consultations,
    audit,
    ctx,
  };
  const adherenceDeps: AdherenceDeps = {
    uow,
    adherence: new SqliteAdherenceRepository(db),
    patients,
    consultations,
    audit,
    ctx,
  };
  const planRepo = new SqliteMealPlanRepository(db);
  const appSettingsDeps: AppSettingsDeps = {
    uow,
    settings: new SqliteAppSettingsRepository(db),
    audit,
    ctx,
  };
  const aiDeps: AiDeps = {
    uow,
    settings: new SqliteAiSettingsRepository(db),
    patients,
    consents,
    measurements: measurementRepo,
    adherence: adherenceDeps.adherence,
    labs: labDeps.labs,
    plans: planRepo,
    audit,
    ctx,
    // The API key is sealed with its own HKDF subkey and only ever opened
    // here, inside the main process.
    secrets: {
      seal: (plaintext) =>
        JSON.stringify(sealEnvelope(Buffer.from(plaintext, 'utf8'), aiSecretKey, AI_KEY_AAD)),
      open: (envelope) =>
        openEnvelope(JSON.parse(envelope) as EnvelopeV1, aiSecretKey, AI_KEY_AAD).toString('utf8'),
    },
    createProvider: (apiKey, model) => new AnthropicProvider(apiKey, model as AiModel),
  };
  const mealPlanDeps: MealPlanDeps = {
    uow,
    plans: planRepo,
    measurements: measurementRepo,
    patients,
    history,
    consultations,
    foods: foodRepo,
    audit,
    ctx,
  };

  return {
    db,
    audit,
    profileRepo,
    useCases: {
      createPatient: new CreatePatientUseCase({ uow, patients, audit, ctx }),
      listPatients: new ListPatientsUseCase(patients),
      getPatient: new GetPatientUseCase(patients),
      createConsultation: new CreateConsultationUseCase(consultationDeps),
      updateConsultation: new UpdateConsultationUseCase(consultationDeps),
      createAppointment: new CreateAppointmentUseCase(appointmentDeps),
      rescheduleAppointment: new RescheduleAppointmentUseCase(appointmentDeps),
      resolveAppointment: new ResolveAppointmentUseCase(appointmentDeps),
      listAgenda: new ListAgendaUseCase({ appointments: appointmentDeps.appointments }),
      recordLabResults: new RecordLabResultsUseCase(labDeps),
      listLabResults: new ListLabResultsUseCase({ labs: labDeps.labs }),
      getAppSettings: new GetAppSettingsUseCase({ settings: appSettingsDeps.settings }),
      saveAppSettings: new SaveAppSettingsUseCase(appSettingsDeps),
      setAutoBackupFolder: new SetAutoBackupFolderUseCase(appSettingsDeps),
      recordAutoBackupRun: new RecordAutoBackupRunUseCase({ settings: appSettingsDeps.settings }),
      getAiSettings: new GetAiSettingsUseCase({ settings: aiDeps.settings }),
      saveAiSettings: new SaveAiSettingsUseCase(aiDeps),
      generateAiProgressSummary: new GenerateAiProgressSummaryUseCase(aiDeps),
      recordAdherence: new RecordAdherenceUseCase(adherenceDeps),
      listAdherence: new ListAdherenceUseCase({ adherence: adherenceDeps.adherence }),
      listConsultations,
      signConsultation: new SignConsultationUseCase(consultationDeps),
      amendConsultation: new AmendConsultationUseCase(consultationDeps),
      addHistoryEntry: new AddHistoryEntryUseCase(historyDeps),
      listHistory,
      recordConsent: new RecordConsentUseCase(consentDeps),
      withdrawConsent: new WithdrawConsentUseCase(consentDeps),
      listConsents,
      exportPatient: new ExportPatientUseCase({
        patients,
        listConsultations,
        listHistory,
        listConsents,
        listMeasurements: new ListMeasurementSessionsUseCase(measurementDeps),
        listPhotos: new ListPatientPhotosUseCase(photoDeps),
        getPhotoData: new GetPatientPhotoDataUseCase(photoDeps),
        toBase64: (bytes) => Buffer.from(bytes).toString('base64'),
        audit,
        ctx,
        appVersion,
      }),
      addPhoto: new AddPatientPhotoUseCase(photoDeps),
      listPhotos: new ListPatientPhotosUseCase(photoDeps),
      getPhotoData: new GetPatientPhotoDataUseCase(photoDeps),
      deletePhoto: new DeletePatientPhotoUseCase(photoDeps),
      createMeasurement: new CreateMeasurementSessionUseCase(measurementDeps),
      listMeasurements: new ListMeasurementSessionsUseCase(measurementDeps),
      createFood: new CreateFoodUseCase(foodDeps),
      updateFood: new UpdateFoodUseCase(foodDeps),
      setFoodAllergens: new SetFoodAllergensUseCase(foodDeps),
      importFoodsCsv: new ImportFoodsCsvUseCase(foodDeps),
      searchFoods: new SearchFoodsUseCase(foodDeps),
      createRecipe: new CreateRecipeUseCase(recipeDeps),
      updateRecipe: new UpdateRecipeUseCase(recipeDeps),
      searchRecipes: new SearchRecipesUseCase(recipeDeps),
      addFoodServing: new AddFoodServingUseCase(recipeDeps),
      createMealPlan: new CreateMealPlanUseCase(mealPlanDeps),
      addPlanItem: new AddPlanItemUseCase(mealPlanDeps),
      removePlanItem: new RemovePlanItemUseCase(mealPlanDeps),
      getMealPlan: new GetMealPlanUseCase(mealPlanDeps),
      setPlanStatus: new SetPlanStatusUseCase(mealPlanDeps),
      copyPlanDay: new CopyPlanDayUseCase(mealPlanDeps),
      shoppingList: new GenerateShoppingListUseCase({ plans: mealPlanDeps.plans }),
      suggestSubstitutes: new SuggestSubstitutesUseCase({
        plans: mealPlanDeps.plans,
        foods: foodRepo,
        history,
      }),
      replacePlanItem: new ReplacePlanItemUseCase(mealPlanDeps),
      listMealPlans: new ListMealPlansUseCase(mealPlanDeps),
      getProfile: new GetProfileUseCase(profileDeps),
      saveProfile: new SaveProfileUseCase(profileDeps),
      setProfileLogo: new SetProfileLogoUseCase(profileDeps),
    },
  };
}
