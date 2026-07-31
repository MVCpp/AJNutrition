import path from 'node:path';
import { app, BrowserWindow, dialog, Notification, powerMonitor, session } from 'electron';
import started from 'electron-squirrel-startup';
import { IPC_EVENTS, type AuthStatusDto } from '@ajnutrition/shared';
import { AppointmentReminders } from './appointment-reminders';
import { AutoBackupRunner } from './auto-backup';
import { registerIpcHandlers } from './ipc';
import { AuthManager } from './auth-manager';
import { LicenseManager } from './license-manager';
import { refreshLicense } from './license-refresh';
import { LICENSE_PUBLIC_KEY, LICENSE_REFRESH_ENDPOINT } from './license-key';
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

/**
 * How often to try a licence refresh. Six hours is a compromise: frequent
 * enough that a suspension lands the same working day on a connected machine,
 * rare enough that the service sees one request per user per few hours rather
 * than a poll.
 */
const LICENSE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const IDLE_POLL_MS = 30 * 1000;
/**
 * How often the scheduled-backup runner wakes up. It only does work once per
 * calendar day, so this is just how quickly it notices that the day rolled
 * over (or that the app was unlocked) — not how often it writes.
 */
const AUTO_BACKUP_POLL_MS = 15 * 60 * 1000;
/** Reminder resolution: the window is in minutes, so once a minute is plenty. */
const REMINDER_POLL_MS = 60 * 1000;

lockDownWebContents(DEV_SERVER_URL);

/** Installed once the scheduled-backup runner exists (see whenReady). */
let onUnlocked: (() => void) | null = null;

function broadcastAuthStatus(status: AuthStatusDto): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_EVENTS.authStatusChanged, status);
  }
  if (status.state === 'unlocked') onUnlocked?.();
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

  const license = new LicenseManager({
    userDataPath: app.getPath('userData'),
    publicKey: LICENSE_PUBLIC_KEY,
  });

  // S-2a: opportunistic licence refresh. Strictly best-effort — it can only
  // ever replace the stored licence with a NEWER signed one, and is never
  // consulted to decide whether the app may run. No endpoint configured (the
  // default) means no network request is made at all.
  const refreshLicenseNow = async () => {
    if (!license.enforced || LICENSE_REFRESH_ENDPOINT === '') return;
    const token = license.token;
    if (token === null) return; // still on the trial: nothing to refresh yet
    try {
      const outcome = await refreshLicense(
        token,
        {
          licenseId: license.status().licenseId ?? '',
          deviceId: license.ensureDeviceId(),
          appVersion: app.getVersion(),
        },
        {
          endpoint: LICENSE_REFRESH_ENDPOINT,
          publicKey: LICENSE_PUBLIC_KEY,
          appVersion: app.getVersion(),
          log: (event, detail) => logger.info('license', event, detail),
        },
      );
      if (outcome.kind === 'updated') {
        const status = license.applyRefreshed(outcome.token);
        logger.info('license', 'refresh.applied', { state: status.state });
      }
    } catch (err) {
      // refreshLicense already swallows its own failures; this is a backstop so
      // a licence check can never take the app down at startup.
      logger.error('license', 'refresh.failed', err);
    }
  };
  void refreshLicenseNow();
  setInterval(() => void refreshLicenseNow(), LICENSE_REFRESH_INTERVAL_MS);

  registerIpcHandlers(auth, DEV_SERVER_URL, logger, license);

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

  // S-109: scheduled backups. Only possible while unlocked (the snapshot needs
  // the live master key), so the runner rides along with the session rather
  // than on a wall-clock schedule of its own.
  const autoBackup = new AutoBackupRunner({
    now: () => new Date(),
    readPreferences: () => auth.getContainer().useCases.getAppSettings.execute(),
    createBackup: (destinationPath, description) =>
      auth.createBackup(destinationPath, description, { automatic: true }),
    markRun: (isoTimestamp) =>
      auth.getContainer().useCases.recordAutoBackupRun.execute(isoTimestamp),
    logger,
  });
  // Epic 6: privacy-safe reminder for an imminent appointment. Only while
  // unlocked — the agenda lives in the encrypted database, and waking a locked
  // machine to announce clinical activity is not this app's job.
  const reminders = new AppointmentReminders({
    now: () => new Date(),
    readSettings: () => auth.getContainer().useCases.getAppSettings.execute(),
    listToday: (isoDate) =>
      auth.getContainer().useCases.listAgenda.execute({ fromDate: isoDate, toDate: isoDate }),
    notify: (title, body) => {
      if (Notification.isSupported()) new Notification({ title, body }).show();
    },
    logger,
  });
  setInterval(() => {
    if (auth.isUnlocked()) reminders.tick();
  }, REMINDER_POLL_MS);

  const runAutoBackup = () => {
    if (auth.isUnlocked()) autoBackup.run();
  };
  setInterval(runAutoBackup, AUTO_BACKUP_POLL_MS);
  // Unlocking is the moment a day's first backup becomes possible; give the
  // window a beat to appear before spending time on a VACUUM snapshot.
  onUnlocked = () => {
    // A fresh session may legitimately re-announce a cita the previous one did.
    reminders.reset();
    setTimeout(runAutoBackup, 5000);
  };

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
