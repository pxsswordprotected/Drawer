import '../index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ContentApp } from './ContentApp';
import { createShadowRootUI } from './shadowRoot';
import { useDrawerStore } from '@/store/drawerStore';

// Cross-browser runtime API (Firefox exposes `browser`, Chrome exposes `chrome`)
const runtime = (typeof browser !== 'undefined' ? browser : chrome).runtime;

// Create shadow DOM and mount React
const { shadowRoot, reactRoot } = createShadowRootUI();

// Inject built CSS into shadow root
const cssUrl = runtime.getURL('content.css');
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = cssUrl;
shadowRoot.prepend(link);

// Inject self-hosted Geist font into shadow root
const fontUrl = runtime.getURL('fonts/Geist-Variable.woff2');
const fontStyle = document.createElement('style');
fontStyle.textContent = `
  @font-face {
    font-family: 'Geist';
    src: url('${fontUrl}') format('woff2');
    font-weight: 100 900;
    font-style: normal;
    font-display: swap;
  }
`;
document.head.appendChild(fontStyle);

// Render ContentApp
const root = ReactDOM.createRoot(reactRoot);
root.render(
  <React.StrictMode>
    <ContentApp />
  </React.StrictMode>
);

// Listen for messages from background script
runtime.onMessage.addListener((message: { type: string }) => {
  if (message.type === 'TOGGLE_DRAWER') {
    useDrawerStore.getState().toggleDrawer('keyboard');
  }
});
