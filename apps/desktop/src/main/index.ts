import path from 'node:path';
import { app, BrowserWindow, dialog, powerMonitor, session } from 'electron';
import started from 'electron-squirrel-startup';
import { IPC_EVENTS, type AuthStatusDto } from '@ajnutrition/shared';
import { registerIpcHandlers } from './ipc';
import { AuthManager } from './auth-manager';
import { Logger } from './logging/logger';
import { applySessionSecurity, lockDownWebContents } from './security';

// Squirrel.Windows fires the executable during install/update events.
if (started) {
  app.quit();
}

// E2E hooks (Playwright): an isolated userData dir so tests never touch real
// patient data, set BEFORE the single-instance lock (which is keyed by
// userData) so a running dev instance and a test instance can coexist.
// Both are inert outside automated runs.
if (process.env.AJN_USER_DATA_DIR) {
  app.setPath('userData', process.env.AJN_USER_DATA_DIR);
}
const E2E_MODE = process.env.AJN_E2E === '1';

// A second instance would open the SQLite database twice; refuse it.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const DEV_SERVER_URL: string | undefined =
  typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'string' ? MAIN_WINDOW_VITE_DEV_SERVER_URL : undefined;

/** Fallback until the practitioner sets their own value in Ajustes (S-107). */
const DEFAULT_INACTIVITY_LOCK_SECONDS = 10 * 60;
const IDLE_POLL_MS = 30 * 1000;

lockDownWebContents(DEV_SERVER_URL);

function broadcastAuthStatus(status: AuthStatusDto): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_EVENTS.authStatusChanged, status);
  }
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });

  window.once('ready-to-show', () => window.show());

  // An accidental ✕ (or Alt+F4 / Cmd+Q) must not kill the app silently:
  // ask first. The dialog is synchronous, so the close event stays blocked
  // until the practitioner answers; "Cancelar" is both default and Esc.
  let confirmedClose = false;
  window.on('close', (event) => {
    // The synchronous dialog would deadlock automated runs on teardown.
    if (confirmedClose || E2E_MODE) return;
    event.preventDefault();
    const choice = dialog.showMessageBoxSync(window, {
      type: 'question',
      buttons: ['Cancelar', 'Cerrar'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: 'NutriPlan',
      message: '¿Cerrar NutriPlan?',
      detail: 'Sus datos están guardados y cifrados; la aplicación se bloqueará al salir.',
    });
    if (choice === 1) {
      confirmedClose = true;
      window.close();
    }
  });

  if (DEV_SERVER_URL) {
    void window.loadURL(DEV_SERVER_URL);
    // Dev only: renderer errors must be visible, not a silent white screen.
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    void window.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
  return window;
}

app.whenReady().then(() => {
  applySessionSecurity(session.defaultSession, DEV_SERVER_URL !== undefined);

  const logger = new Logger({
    dir: path.join(app.getPath('userData'), 'logs'),
    appVersion: app.getVersion(),
  });
  logger.info('app', 'start', { platform: process.platform, dev: DEV_SERVER_URL !== undefined });

  const auth = new AuthManager({
    userDataPath: app.getPath('userData'),
    appVersion: app.getVersion(),
    onStatusChanged: broadcastAuthStatus,
    logger,
  });

  registerIpcHandlers(auth, DEV_SERVER_URL, logger);

  // S-107: lock when the operating-system session locks or suspends.
  powerMonitor.on('lock-screen', () => auth.lock('os-lock'));
  powerMonitor.on('suspend', () => auth.lock('os-lock'));

  // S-107: lock after system-wide inactivity (measured by the OS, so the
  // renderer cannot fake activity).
  setInterval(() => {
    if (!auth.isUnlocked()) return;
    // Read on every tick so a change in Ajustes takes effect immediately;
    // the setting lives in the encrypted DB, hence only while unlocked.
    let limitSeconds = DEFAULT_INACTIVITY_LOCK_SECONDS;
    try {
      limitSeconds = auth.getContainer().useCases.getAppSettings.execute().autoLockMinutes * 60;
    } catch {
      // Unreadable settings must never disable auto-lock: keep the default.
    }
    if (powerMonitor.getSystemIdleTime() >= limitSeconds) auth.lock('inactivity');
  }, IDLE_POLL_MS);

  app.on('will-quit', () => auth.lock('quit'));

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('second-instance', () => {
  const [window] = BrowserWindow.getAllWindows();
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});

app.on('window-all-closed', () => {
  // Single-practitioner desktop app: quitting on close is the expected
  // behavior on Windows/Linux; macOS convention will be revisited with the
  // macOS port.
  if (process.platform !== 'darwin') app.quit();
});
