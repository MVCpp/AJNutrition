import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './locales/es.json';

/**
 * i18n foundation (S-112). Spanish (es-MX) is the base and only shipped
 * locale today; adding a language = adding a locale file + registering it
 * here. Main-process AppError messages are currently Spanish at the source —
 * renderer-side translation of error CODES is the planned path for full
 * multi-language support (error codes already cross IPC).
 */
void i18n.use(initReactI18next).init({
  lng: 'es',
  fallbackLng: 'es',
  resources: { es: { translation: es } },
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
