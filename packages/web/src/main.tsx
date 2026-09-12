import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import './styles/index.css';

// Global error listener to capture and display any startup errors
window.addEventListener('error', (event) => {
  console.error('[Pickup Global Startup Error]:', event.error || event.message);
  const root = document.getElementById('root');
  if (root && root.children.length === 0) {
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#030610;color:#F8FAFC;font-family:system-ui,-apple-system,sans-serif;text-align:center;">
        <div style="max-width:480px;background:rgba(11,16,28,0.9);border:1px solid rgba(244,63,94,0.4);border-radius:16px;padding:32px;box-shadow:0 20px 40px rgba(0,0,0,0.8);">
          <h2 style="color:#F43F5E;margin-top:0;">Failed to Load Pickup</h2>
          <p style="color:#94A3B8;font-size:14px;line-height:1.5;">An unexpected script error prevented the application from starting.</p>
          <pre style="background:rgba(0,0,0,0.5);color:#FCA5A5;padding:12px;border-radius:8px;font-size:12px;text-align:left;overflow-x:auto;white-space:pre-wrap;">${event.message || 'Unknown error'}</pre>
          <button onclick="window.location.reload()" style="margin-top:16px;padding:10px 20px;border-radius:8px;background:#06B6D4;color:#030712;border:none;font-weight:600;cursor:pointer;">Reload Page</button>
        </div>
      </div>
    `;
  }
});

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
} else {
  console.error('[Pickup] Fatal: Target DOM element #root not found.');
}


