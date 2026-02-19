import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import {
  canClearOfflineCache,
  clearOfflineCache,
  createErrorDetails,
  formatDiagnostics,
  hardRefresh,
} from './components/errorRecovery';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const renderBootstrapFallback = (error: unknown, source: string): void => {
  const details = createErrorDetails(error, source, 'Unhandled bootstrap exception');
  const shouldShowClearCacheButton = canClearOfflineCache();
  const clearCacheButton = shouldShowClearCacheButton
    ? '<button id="clear-offline-cache" style="cursor:pointer;border:1px solid #d97706;border-radius:0.5rem;padding:0.6rem 1rem;background:#fff7ed;color:#9a3412;font-weight:600;">Show advanced recovery</button>'
    : '';

  rootElement.innerHTML = `
    <section style="font-family:system-ui,sans-serif;max-width:48rem;margin:8vh auto;padding:1.25rem;border:1px solid #fca5a5;border-radius:0.75rem;background:#fff1f2;color:#111827;line-height:1.5;">
      <h1 style="margin:0 0 0.75rem;font-size:1.5rem;">Application error</h1>
      <p style="margin:0.5rem 0;">The app hit an unexpected exception before startup completed.</p>
      <p style="margin:0.5rem 0;">Use diagnostics for debugging. Reload to retry; advanced recovery is optional and only resets browser-managed offline state.</p>
      <pre id="error-diagnostics" style="margin:1rem 0;padding:0.75rem;border-radius:0.5rem;border:1px solid #fecaca;background:#ffffff;white-space:pre-wrap;word-break:break-word;font-size:0.9rem;"></pre>
      <div style="display:flex;gap:0.75rem;margin-top:1rem;flex-wrap:wrap;">
        <button id="hard-refresh" style="cursor:pointer;border:none;border-radius:0.5rem;padding:0.6rem 1rem;background:#dc2626;color:#ffffff;font-weight:600;">Reload app</button>
        <button id="copy-diagnostics" style="cursor:pointer;border:1px solid #991b1b;border-radius:0.5rem;padding:0.6rem 1rem;background:#ffffff;color:#7f1d1d;font-weight:600;">Copy diagnostics</button>
        ${clearCacheButton}
      </div>
      <p id="copy-status" style="margin-top:0.75rem;font-size:0.9rem;"></p>
    </section>
  `;

  const diagnostics = formatDiagnostics(details);
  const diagnosticsElement = document.getElementById('error-diagnostics');
  if (diagnosticsElement) {
    diagnosticsElement.textContent = diagnostics;
  }

  document.getElementById('hard-refresh')?.addEventListener('click', () => {
    hardRefresh();
  });

  document.getElementById('copy-diagnostics')?.addEventListener('click', async () => {
    const copyStatus = document.getElementById('copy-status');

    try {
      await navigator.clipboard.writeText(diagnostics);
      if (copyStatus) {
        copyStatus.textContent = 'Diagnostics copied to clipboard.';
      }
    } catch {
      if (copyStatus) {
        copyStatus.textContent = 'Could not copy automatically. Select and copy the diagnostics text manually.';
      }
    }
  });

  const clearOfflineCacheButton = document.getElementById('clear-offline-cache');
  if (clearOfflineCacheButton) {
    clearOfflineCacheButton.addEventListener('click', async () => {
      clearOfflineCacheButton.textContent = 'Reset offline data';
      clearOfflineCacheButton.addEventListener('click', async () => {
        await clearOfflineCache();
        hardRefresh();
      }, { once: true });

      const copyStatus = document.getElementById('copy-status');
      if (copyStatus) {
        copyStatus.textContent = 'Advanced recovery revealed. Click “Reset offline data” to clear service workers and cache storage, then reload.';
      }
    }, { once: true });
  }
};

let didRenderBootstrapFallback = false;

const showBootstrapFallbackOnce = (error: unknown, source: string): void => {
  if (didRenderBootstrapFallback) {
    return;
  }

  didRenderBootstrapFallback = true;
  renderBootstrapFallback(error, source);
};

window.addEventListener('error', (event) => {
  showBootstrapFallbackOnce(event.error ?? event.message, 'window.error');
});

window.addEventListener('unhandledrejection', (event) => {
  showBootstrapFallbackOnce(event.reason, 'window.unhandledrejection');
});

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
