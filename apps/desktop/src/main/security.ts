import { app, type Session } from 'electron';

/**
 * Electron security baseline (docs/security/threat-model.md).
 * Everything here is default-deny; features that later need a permission
 * (e.g. microphone for transcription) must opt in explicitly with a
 * documented business purpose.
 */

const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Tailwind/React inject inline style attributes; scripts stay 'self'-only.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const DEV_CSP = PROD_CSP.replace(
  "connect-src 'self'",
  "connect-src 'self' ws://localhost:5173 http://localhost:5173",
);

export function applySessionSecurity(session: Session, isDev: boolean): void {
  // Default-deny every permission request (camera, mic, notifications, ...).
  session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);

  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [isDev ? DEV_CSP : PROD_CSP],
      },
    });
  });
}

/** Registers navigation/window-creation lockdown for every WebContents. */
export function lockDownWebContents(devServerUrl: string | undefined): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      // The renderer is a single-page app: block all real navigation except
      // the dev server reloading itself during development.
      const allowed = devServerUrl !== undefined && url.startsWith(devServerUrl);
      if (!allowed) event.preventDefault();
    });

    contents.setWindowOpenHandler(() => {
      // No feature opens child windows yet. External links, when introduced,
      // go through an allowlist + shell.openExternal — never a new window.
      return { action: 'deny' };
    });

    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });
  });
}
