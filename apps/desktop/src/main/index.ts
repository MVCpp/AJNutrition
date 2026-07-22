import path from 'node:path';
import { app, BrowserWindow, powerMonitor, session } from 'electron';
import started from 'electron-squirrel-startup';
import { IPC_EVENTS, type AuthStatusDto } from '@ajnutrition/shared';
import { registerIpcHandlers } from './ipc';
import { AuthManager } from './auth-manager';
import { applySessionSecurity, lockDownWebContents } from './security';

// Squirrel.Windows fires the executable during install/update events.
if (started) {
  app.quit();
}

// A second instance would open the SQLite database twice; refuse it.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const DEV_SERVER_URL: string | undefined =
  typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'string' ? MAIN_WINDOW_VITE_DEV_SERVER_URL : undefined;

/** Auto-lock after this much user inactivity (S-107). Configurable via settings later. */
const INACTIVITY_LOCK_SECONDS = 10 * 60;
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

  if (DEV_SERVER_URL) {
    void window.loadURL(DEV_SERVER_URL);
  } else {
    void window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
  return window;
}

app.whenReady().then(() => {
  applySessionSecurity(session.defaultSession, DEV_SERVER_URL !== undefined);

  const auth = new AuthManager({
    userDataPath: app.getPath('userData'),
    appVersion: app.getVersion(),
    onStatusChanged: broadcastAuthStatus,
  });

  registerIpcHandlers(auth, DEV_SERVER_URL);

  // S-107: lock when the operating-system session locks or suspends.
  powerMonitor.on('lock-screen', () => auth.lock('os-lock'));
  powerMonitor.on('suspend', () => auth.lock('os-lock'));

  // S-107: lock after system-wide inactivity (measured by the OS, so the
  // renderer cannot fake activity).
  setInterval(() => {
    if (auth.isUnlocked() && powerMonitor.getSystemIdleTime() >= INACTIVITY_LOCK_SECONDS) {
      auth.lock('inactivity');
    }
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
