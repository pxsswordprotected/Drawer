// Shadow DOM setup for CSS isolation

import { DRAWER_CONFIG } from '@/shared/constants';

export interface ShadowRootUI {
  shadowRoot: ShadowRoot;
  reactRoot: HTMLDivElement;
  container: HTMLDivElement;
}

/**
 * Creates a Shadow DOM conta iner for the extension UI
 * This isolates our CSS from the host page and prevents conflicts
 */
export function createShadowRootUI(): ShadowRootUI {
  // Create container element
  const container = document.createElement('div');
  container.id = DRAWER_CONFIG.SHADOW_DOM_ID;
  container.style.position = 'fixed';
  container.style.zIndex = String(DRAWER_CONFIG.Z_INDEX);
  container.style.pointerEvents = 'none'; // Let clicks pass through to page
  document.body.appendChild(container);

  // Attach Shadow DOM
  const shadowRoot = container.attachShadow({ mode: 'open' });

  // Create React root inside Shadow DOM
  const reactRoot = document.createElement('div');
  reactRoot.id = 'react-root';
  reactRoot.style.pointerEvents = 'auto'; // Enable clicks on our UI
  shadowRoot.appendChild(reactRoot);

  // Add base styles to ensure proper rendering
  const baseStyles = document.createElement('style');
  baseStyles.textContent = `
    * {
      box-sizing: border-box;
    }

    #react-root {
      font-family: 'Geist', system-ui, -apple-system, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Ensure toasts are positioned correctly within Shadow DOM */
    .Toastify__toast-container {
      position: fixed !important;
    }
  `;
  shadowRoot.appendChild(baseStyles);

  return { shadowRoot, reactRoot, container };
}

/**
 * Remove the Shadow DOM container from the page
 */
export function removeShadowRootUI(): void {
  const container = document.getElementById(DRAWER_CONFIG.SHADOW_DOM_ID);
  if (container) {
    container.remove();
  }
}

/**
 * Check if Shadow DOM UI already exists
 */
export function shadowRootUIExists(): boolean {
  return document.getElementById(DRAWER_CONFIG.SHADOW_DOM_ID) !== null;
}
