import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

function Fallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 12,
        textAlign: 'center',
        padding: 32,
        fontFamily: 'Inter, sans-serif',
        background: '#F7F1E3',
        color: '#17152A',
      }}
    >
      <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>Something went wrong loading the page.</p>
      <p style={{ opacity: 0.7 }}>Please refresh, or reach the college directly at bimacad2024@gmail.com.</p>
    </div>
  );
}

const container = document.getElementById('root');
createRoot(container).render(
  <ErrorBoundary fallback={<Fallback />}>
    <App />
  </ErrorBoundary>
);

// Lets the classic (non-module) inline script in the HTML shell tell
// whether the module bundle above ever actually ran — the one thing that
// can't be caught by the ErrorBoundary, since a script that never loads
// (blocked CDN, offline, corporate firewall, ad-blocker) never gets the
// chance to throw in the first place. See the "enhancement timeout" check
// right after <div id="root"> in the HTML shell.
window.__BIC_APP_MOUNTED__ = true;
