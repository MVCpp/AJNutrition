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

  // Pin a SMALL window on purpose. A CI runner's screen is smaller than any
  // development machine, and that difference hid a real bug: the modal's ✕
  // rendered under the header, which is layered above it, so the button was
  // unclickable. It passed on every developer screen and failed the first time
  // CI ran the suite. Pinning the constrained size is what makes a local run
  // mean the same thing as a CI run.
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1024, 700);
  });
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

test('warns about unsaved typing and does not lock without confirmation', async () => {
  await nav()
    .getByRole('button', { name: /Pacientes/ })
    .click();
  await page.getByRole('button', { name: 'Abrir expediente de Prueba EndToEnd' }).click();
  await page.getByRole('button', { name: 'Nueva consulta' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Subjetivo (S)').fill('Refiere apego parcial');

  // Scoped to the header: every section stays mounted, and the Ajustes note
  // explaining this behaviour contains the same words.
  const unsavedChip = page.getByRole('banner').getByText('Cambios sin guardar');
  await expect(unsavedChip).toBeVisible();

  // Playwright dismisses window.confirm by default, i.e. the practitioner
  // answered "no": the app must stay unlocked and keep the text.
  await page.getByRole('button', { name: /Bloquear/ }).click();
  await expect(page.getByRole('heading', { name: 'NutriPlan está bloqueado' })).toBeHidden();
  await expect(dialog.getByLabel('Subjetivo (S)')).toHaveValue('Refiere apego parcial');

  // Discarding the form clears the warning.
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await expect(unsavedChip).toBeHidden();
  await page.getByRole('button', { name: '← Volver a pacientes' }).click();
});

test('locks and unlocks again with the same passphrase', async () => {
  await page.getByRole('button', { name: /Bloquear/ }).click();
  await expect(page.getByRole('heading', { name: 'NutriPlan está bloqueado' })).toBeVisible();
  await page.getByLabel('Frase de acceso', { exact: true }).fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Desbloquear', exact: true }).click();
  await expect(nav().getByRole('button', { name: /Pacientes/ })).toBeVisible({ timeout: 60_000 });
});

/**
 * Coach sharing (docs/product/coach-sharing.md, C-1..C-3).
 *
 * The unit tests pin each rule against a repository; this pins the same rules
 * through the real IPC boundary, the real encrypted database and the real
 * screens — the layers where a rule can be correct and still never reached.
 *
 * The report itself is not exported here: it opens a native save dialog, which
 * cannot be driven from the renderer. Everything up to that point is the part
 * that decides whether anything MAY be sent, and that is what this covers.
 */

/**
 * The patient's expediente, on the Entrenador tab.
 *
 * Works whether or not the workspace is already open: clicking the nav while
 * inside an expediente keeps it open, so the list row is not always there.
 */
async function openCoachTab() {
  await nav()
    .getByRole('button', { name: /Pacientes/ })
    .click();
  const openRecord = page.getByRole('button', { name: 'Abrir expediente de Prueba EndToEnd' });
  const coachTab = page.getByRole('tab', { name: /Entrenador/ });
  await expect(openRecord.or(coachTab).first()).toBeVisible();
  if (await openRecord.isVisible()) {
    await openRecord.click();
  }
  await coachTab.click();
}

async function openConsentsTab() {
  await page.getByRole('tab', { name: /Consentimientos/ }).click();
}

test('registers a personal trainer who refers trainees', async () => {
  await nav()
    .getByRole('button', { name: /Entrenadores/ })
    .click();
  await page.getByRole('button', { name: 'Nuevo entrenador' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre', { exact: true }).fill('Carlos E2E');
  await dialog.getByLabel('Gimnasio o estudio').fill('Gimnasio Prueba');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Carlos E2E' })).toBeVisible();
});

test('linking a patient to a trainer authorises nothing on its own', async () => {
  // The correction that building C-1 forced on the design: recording who
  // someone trains with is administrative record-keeping. If the link were
  // enough to share, she could not note a trainer without a consent form —
  // and noting one would quietly become a licence to send.
  await openCoachTab();
  await page.getByLabel('Vincular con').selectOption({ label: 'Carlos E2E' });
  await page.getByRole('button', { name: 'Vincular' }).click();
  await expect(page.getByText(/Vinculado desde/)).toBeVisible();

  // Linked, and still nothing may be shared: the panel asks for the consent.
  await expect(page.getByText(/primero registre en la pestaña Consentimientos/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Autorizar' })).toHaveCount(0);
});

test('an express transfer consent is what permits sharing', async () => {
  await openConsentsTab();
  await page.getByRole('button', { name: 'Registrar consentimiento' }).click();
  await page
    .getByLabel('Tipo de consentimiento')
    .selectOption({ label: 'Transferencia a terceros' });
  await page.getByLabel('Decisión').selectOption({ label: 'Otorgado' });
  await page.getByLabel('Versión del aviso de privacidad').fill('AVISO-E2E');
  await page.getByLabel('Método de captura').selectOption({ label: 'Escrito' });
  await page.getByRole('button', { name: 'Guardar' }).click();

  await openCoachTab();
  await page.getByLabel('Consentimiento que lo autoriza').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Autorizar' }).click();

  await expect(page.getByText('Autorización vigente')).toBeVisible();
  // Exactly the default scope, and nothing beyond it.
  await expect(page.getByText('Mediciones y peso')).toBeVisible();
  await expect(page.getByText('Fotografías de progreso')).toHaveCount(0);
});

test('withdrawing the consent stops the sharing on the very next read', async () => {
  // The whole point of C-2, end to end. Nothing sweeps, nothing expires: the
  // answer is re-derived from the consent every time it is asked, so the
  // authorisation is dead the moment she records the withdrawal.
  await openConsentsTab();
  page.once('dialog', (d) => void d.accept());
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Transferencia a terceros' })
    .getByRole('button', { name: 'Retirar' })
    .click();

  await openCoachTab();
  await expect(page.getByText('Autorización sin efecto')).toBeVisible();
  await expect(page.getByText(/retiró el consentimiento/)).toBeVisible();
  await expect(page.getByText('Autorización vigente')).toHaveCount(0);
  // The record of what was authorised survives — that history is the patient's
  // answer to "who could see my data?", not something to tidy away.
  await expect(page.getByText(/Autorizaciones anteriores|Autorización sin efecto/)).toBeVisible();
});
