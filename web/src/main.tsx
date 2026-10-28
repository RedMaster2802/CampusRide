// web/src/main.tsx
// Entry point

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker (only in production build)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // @ts-expect-error - virtual module provided by vite-plugin-pwa at build time
  import('virtual:pwa-register').then(({ registerSW }) => {
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
  }).catch(() => {
    // virtual:pwa-register not available in dev
  });
}