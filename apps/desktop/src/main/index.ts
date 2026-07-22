import path from 'node:path';
import { app, BrowserWindow, dialog, session } from 'electron';
import started from 'electron-squirrel-startup';
import { registerIpcHandlers } from './ipc';
import { createContainer } from './container';
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

lockDownWebContents(DEV_SERVER_URL);

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

  try {
    const container = createContainer(app.getPath('userData'), app.getVersion());
    registerIpcHandlers(container, DEV_SERVER_URL);
  } catch (err) {
    // Startup failures (corrupted DB, failed migration) must be explained,
    // never silently swallowed — and never wipe data.
    dialog.showErrorBox(
      'AJNutrition no pudo iniciar',
      err instanceof Error ? err.message : 'Error desconocido al abrir la base de datos.',
    );
    app.quit();
    return;
  }

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
