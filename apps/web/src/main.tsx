import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/mockup.css';
import './app.css';
import { App } from './App';
import { AuthProvider } from './lib/auth';
import { legacyRedirect } from './lib/router';
import { restoreTheme } from './lib/theme';

restoreTheme();
const legacy = legacyRedirect(location.search);
if (legacy) history.replaceState(null, '', `/${legacy}`);

const el = document.getElementById('root');
if (!el) throw new Error('#root tidak ada');
createRoot(el).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
