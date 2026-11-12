// Shadow DOM setup for CSS isolation

import { DRAWER_CONFIG } from '@/shared/constants';

interface ShadowRootUI {
  shadowRoot: ShadowRoot;
  reactRoot: HTMLDivElement;
}

/**
 * Creates a Shadow DOM container for the extension UI
 * This isolates our CSS from the host page and prevents conflicts
 */
export function createShadowRootUI(): ShadowRootUI {
  // Create container element
  const container = document.createElement('div');
  container.id = DRAWER_CONFIG.SHADOW_DOM_ID;
  container.style.position = 'fixed';
  container.style.inset = '0';
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
  keepUiSelectionsInside(shadowRoot, reactRoot);

  // Add base styles to ensure proper rendering
  const baseStyles = document.createElement('style');
  baseStyles.textContent = `
    * {
      box-sizing: border-box;
    }

    :host {
      all: initial;
    }

    #react-root {
      display: block;
      font-family: 'Geist', system-ui, -apple-system, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
  `;
  shadowRoot.appendChild(baseStyles);

  return { shadowRoot, reactRoot };
}

// Selection.getComposedRanges (present in current Chromium and Firefox); not yet in the TS DOM lib.
// Where it's missing, the clamp below does nothing.
type ComposedSelection = Selection & {
  getComposedRanges?: (options: { shadowRoots: ShadowRoot[] }) => StaticRange[];
};

/**
 * A selection that starts on the extension UI (drawer text) must stay inside it.
 * Firefox lets such a drag extend into the host page behind the drawer; Chromium keeps it
 * in the shadow tree. While a press that began on the UI is held, a selection with one end
 * inside the shadow root and the other outside is put back to the last one that was fully
 * inside. A selection entirely in the page is left alone: pressing the "+" button must not
 * clear the page text the user is about to save.
 */
function keepUiSelectionsInside(shadowRoot: ShadowRoot, reactRoot: HTMLElement): void {
  reactRoot.addEventListener(
    'pointerdown',
    (down) => {
      if (!down.isPrimary) return;
      let lastInside: StaticRange | null = null;

      const clamp = () => {
        const selection = document.getSelection() as ComposedSelection | null;
        if (!selection?.getComposedRanges || selection.rangeCount === 0) return;
        const [range] = selection.getComposedRanges({ shadowRoots: [shadowRoot] });
        if (!range) return;
        const startInside = shadowRoot.contains(range.startContainer);
        const endInside = shadowRoot.contains(range.endContainer);
        if (startInside && endInside) {
          lastInside = range;
          return;
        }
        if (!startInside && !endInside) return; // page selection: not ours to change
        if (lastInside) {
          const { startContainer, startOffset, endContainer, endOffset } = lastInside;
          selection.setBaseAndExtent(startContainer, startOffset, endContainer, endOffset);
        } else {
          selection.removeAllRanges();
        }
      };

      const release = (e: Event) => {
        if (e instanceof PointerEvent && e.pointerId !== down.pointerId) return;
        clamp(); // the release itself can extend the selection one last time
        document.removeEventListener('selectionchange', clamp);
        window.removeEventListener('pointerup', release, true);
        window.removeEventListener('pointercancel', release, true);
        window.removeEventListener('blur', release);
      };
      document.addEventListener('selectionchange', clamp);
      window.addEventListener('pointerup', release, true);
      window.addEventListener('pointercancel', release, true);
      window.addEventListener('blur', release); // released outside the window, focus lost
    },
    true
  );
}
