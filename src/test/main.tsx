import React from 'react';
import ReactDOM from 'react-dom/client';
import { TestApp } from './TestApp';
import '../index.css';
import { Agentation } from 'agentation';
import { Slowmo } from 'slowmo/react';

// slowmo's dial defaults to the bottom-right corner, on top of the drawer logo. Start it
// bottom-left instead; once dragged, slowmo saves and reuses the user's position.
if (process.env.NODE_ENV === 'development' && !localStorage.getItem('slowmo-dial-position')) {
  localStorage.setItem(
    'slowmo-dial-position',
    JSON.stringify({ right: window.innerWidth - 64 - 20, bottom: 20 })
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TestApp />
    {process.env.NODE_ENV === 'development' && <Agentation />}
    {process.env.NODE_ENV === 'development' && <Slowmo />}
  </React.StrictMode>
);
