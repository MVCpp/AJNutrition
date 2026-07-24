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
  CreateRecipeUseCase,
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
  CreatePatientUseCase,
  GetMealPlanUseCase,
  SetPlanStatusUseCase,
  CopyPlanDayUseCase,
  GenerateShoppingListUseCase,
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
} from '@ajnutrition/application';
import {
  assertSchemaNotAhead,
  checkIntegrity,
  openDatabase,
  runMigrations,
  SqliteAuditLog,
  SqliteClinicalHistoryRepository,
  SqliteConsentRepository,
  SqliteConsultationRepository,
  SqliteFoodRepository,
  SqliteFoodServingRepository,
  SqliteRecipeRepository,
  SqliteMealPlanRepository,
  SqliteProfileRepository,
  SqliteMeasurementRepository,
  SqlitePhotoRepository,
  SqlitePatientRepository,
  SqliteUnitOfWork,
  type SqliteDatabase,
} from '@ajnutrition/database';
import { AppError } from '@ajnutrition/shared';
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
    searchFoods: SearchFoodsUseCase;
    createRecipe: CreateRecipeUseCase;
    searchRecipes: SearchRecipesUseCase;
    addFoodServing: AddFoodServingUseCase;
    createMealPlan: CreateMealPlanUseCase;
    addPlanItem: AddPlanItemUseCase;
    removePlanItem: RemovePlanItemUseCase;
    getMealPlan: GetMealPlanUseCase;
    setPlanStatus: SetPlanStatusUseCase;
    copyPlanDay: CopyPlanDayUseCase;
    shoppingList: GenerateShoppingListUseCase;
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
export function createContainer(
  userDataPath: string,
  appVersion: string,
  dbKeyHex: string,
  attachmentKey: Buffer,
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
    audit,
    ctx,
  };
  const profileRepo = new SqliteProfileRepository(db);
  const profileDeps: ProfileDeps = { uow, profile: profileRepo, audit, ctx };
  const mealPlanDeps: MealPlanDeps = {
    uow,
    plans: new SqliteMealPlanRepository(db),
    measurements: measurementRepo,
    patients,
    history,
    consultations,
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
      searchFoods: new SearchFoodsUseCase(foodDeps),
      createRecipe: new CreateRecipeUseCase(recipeDeps),
      searchRecipes: new SearchRecipesUseCase(recipeDeps),
      addFoodServing: new AddFoodServingUseCase(recipeDeps),
      createMealPlan: new CreateMealPlanUseCase(mealPlanDeps),
      addPlanItem: new AddPlanItemUseCase(mealPlanDeps),
      removePlanItem: new RemovePlanItemUseCase(mealPlanDeps),
      getMealPlan: new GetMealPlanUseCase(mealPlanDeps),
      setPlanStatus: new SetPlanStatusUseCase(mealPlanDeps),
      copyPlanDay: new CopyPlanDayUseCase(mealPlanDeps),
      shoppingList: new GenerateShoppingListUseCase({ plans: mealPlanDeps.plans }),
      listMealPlans: new ListMealPlansUseCase(mealPlanDeps),
      getProfile: new GetProfileUseCase(profileDeps),
      saveProfile: new SaveProfileUseCase(profileDeps),
      setProfileLogo: new SetProfileLogoUseCase(profileDeps),
    },
  };
}
