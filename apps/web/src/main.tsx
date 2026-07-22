// SPDX-License-Identifier: GPL-3.0-only
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';

const root = document.querySelector('#root');

if (!root) {
  throw new Error('Web application root is unavailable.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
