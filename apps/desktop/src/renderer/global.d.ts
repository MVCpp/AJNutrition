import type { AjnApi } from '@ajnutrition/shared';

declare global {
  interface Window {
    /** Injected by the preload bridge (src/preload/index.ts). */
    ajnutrition: AjnApi;
  }
}

export {};
