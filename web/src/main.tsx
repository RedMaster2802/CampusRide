// web/src/main.tsx
// Entry point

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { registerSW } from 'virtual:pwa-register';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker
if ('serviceWorker' in navigator) {
  registerSW({
    onNeedRefresh() {
      if (confirm('New version available. Reload?')) {
        window.location.reload();
      }
    },
    onOfflineReady() {
      console.log('App ready for offline use');
    },
  });
}