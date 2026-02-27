import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { AuthProvider } from './contexts/AuthContext';
import { ChartModalProvider } from './lib/chartModalContext';
import { router } from './router';
import './styles/index.css';

// Register service worker for PWA support
if ('serviceWorker' in navigator && (import.meta as any).env?.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ChartModalProvider>
        <RouterProvider router={router} />
      </ChartModalProvider>
    </AuthProvider>
  </StrictMode>
);
