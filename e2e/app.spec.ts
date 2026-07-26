import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { _electron, type ElectronApplication, type Page } from 'playwright';

/**
 * Full-journey smoke test against the packaged app: first-run setup with a
 * passphrase, recovery key, catalog seeding, patient creation, food search,
 * lock and unlock. One serial story — later steps depend on earlier ones.
 *
 * The app runs with AJN_USER_DATA_DIR pointing at a fresh temp dir (never
 * the real practice data) and AJN_E2E=1 (skips the close-confirmation
 * dialog that would deadlock teardown).
 */

const PASSPHRASE = 'frase de prueba e2e segura';

test.describe.configure({ mode: 'serial' });

/** The header nav — home-page stat tiles reuse the same labels. */
const nav = () => page.getByRole('navigation');

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  // The packaged exe has the EnableNodeCliInspectArguments fuse OFF (release
  // hardening), which blocks Playwright's driver. Instead we run the same
  // production .vite build through the unfused dev Electron binary — build
  // it first with `pnpm package` (or any forge build).
  const root = path.join(__dirname, '..');
  const electronDir = path.join(root, 'node_modules', 'electron');
  const exeName = readFileSync(path.join(electronDir, 'path.txt'), 'utf8').trim();
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'ajn-e2e-'));
  app = await _electron.launch({
    executablePath: path.join(electronDir, 'dist', exeName),
    args: [path.join(root, 'apps', 'desktop')],
    env: { ...process.env, AJN_USER_DATA_DIR: userDataDir, AJN_E2E: '1' },
  });
  page = await app.firstWindow();
});

test.afterAll(async () => {
  await app?.close();
});

test('first run asks for setup and encrypts with a passphrase', async () => {
  await expect(page.getByRole('heading', { name: 'Configuración inicial' })).toBeVisible();
  await page.getByLabel(/Frase de acceso \(mínimo/).fill(PASSPHRASE);
  await page.getByLabel('Confirme la frase de acceso').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Crear y cifrar base de datos' }).click();
});

test('shows the recovery key once and requires confirming it was saved', async () => {
  await expect(page.getByRole('heading', { name: 'Guarde su clave de recuperación' })).toBeVisible({
    // scrypt + first-unlock catalog seeding (2,000+ foods) run before this.
    timeout: 120_000,
  });
  const continueButton = page.getByRole('button', { name: 'Continuar' });
  await expect(continueButton).toBeDisabled();
  await page.getByLabel(/He guardado la clave de recuperación/).check();
  await continueButton.click();
  await expect(nav().getByRole('button', { name: /Pacientes/ })).toBeVisible();
});

test('creates a patient through the dedicated modal', async () => {
  await nav()
    .getByRole('button', { name: /Pacientes/ })
    .click();
  await page.getByRole('button', { name: 'Nuevo paciente' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Nombre\(s\)/).fill('Prueba');
  await dialog.getByLabel(/Apellido\(s\)/).fill('EndToEnd');
  await dialog.getByLabel(/Fecha de nacimiento/).fill('1990-05-10');
  await dialog.getByRole('button', { name: 'Guardar paciente' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('EndToEnd')).toBeVisible();
});

test('the bundled Mexican catalog is seeded and searchable', async () => {
  await nav()
    .getByRole('button', { name: /Alimentos/ })
    .click();
  await page.getByLabel('Buscar alimento').fill('maiz tortilla');
  await expect(page.getByText('Maiz Tortilla', { exact: true })).toBeVisible();
  await expect(page.getByText('MX', { exact: true }).first()).toBeVisible();
});

test('locks and unlocks again with the same passphrase', async () => {
  await page.getByRole('button', { name: /Bloquear/ }).click();
  await expect(page.getByRole('heading', { name: 'NutriPlan está bloqueado' })).toBeVisible();
  await page.getByLabel('Frase de acceso', { exact: true }).fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Desbloquear', exact: true }).click();
  await expect(nav().getByRole('button', { name: /Pacientes/ })).toBeVisible({ timeout: 60_000 });
});
