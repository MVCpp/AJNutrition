import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const PROD_META_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/**
 * Injects the strict meta CSP at BUILD time only. In dev it must be absent:
 * @vitejs/plugin-react injects an inline react-refresh preamble that
 * `script-src 'self'` would block, leaving a white screen. Development is
 * still covered by the runtime header CSP (src/main/security.ts), which has
 * a documented dev variant.
 */
function injectProductionCsp(): Plugin {
  return {
    name: 'ajnutrition-inject-prod-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${PROD_META_CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), injectProductionCsp()],
});
