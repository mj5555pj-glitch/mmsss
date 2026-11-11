import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register service worker for PWA support with safe sandboxing checks
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    try {
      // Some iframe sandboxes allow navigator.serviceWorker but throw SecurityError synchronously or asynchronously on registration
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('Service Worker registered with scope:', reg.scope);
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('New Service Worker version ready.');
                  if (reg.waiting) {
                    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                  }
                }
              };
            }
          };
        })
        .catch((err) => {
          console.warn('Service Worker registration failed (this is expected in some sandboxed iframe previews):', err);
        });
    } catch (e) {
      console.warn('Service worker registration was blocked or failed due to security context:', e);
    }
  });
}

