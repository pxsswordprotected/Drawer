/// <reference types="vite/client" />
import type Browser from 'webextension-polyfill';

declare global {
  const browser: typeof Browser;
  const chrome: typeof chrome;
  /** True in the dev page and `build:extension:debug`; false in the normal extension build */
  const __DRAWER_DEBUG__: boolean;
}
