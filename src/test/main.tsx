import React from 'react';
import ReactDOM from 'react-dom/client';
import { TestApp } from './TestApp';
import '../index.css';
import { Agentation } from 'agentation';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TestApp />
    {process.env.NODE_ENV === 'development' && <Agentation />}
  </React.StrictMode>
);
