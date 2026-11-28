import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/mockup.css';
import './app.css';
import { App } from './App';
import { AuthProvider, useAuth } from './lib/auth';
import { ConfigProvider } from './lib/kpi';
import { legacyRedirect } from './lib/router';
import { restoreTheme } from './lib/theme';

restoreTheme();
const legacy = legacyRedirect(location.search);
if (legacy) history.replaceState(null, '', `/${legacy}`);

/** Config (settings) dimuat setelah login; sebelum login pakai default. */
function ConfigGate() {
  const { me } = useAuth();
  return (
    <ConfigProvider
      key={me ? JSON.stringify([me.kind, me.name, me.role, me.locations, me.permissions, me.menus, me.line, me.screen]) : 'out'}
      enabled={Boolean(me)}
    >
      <App />
    </ConfigProvider>
  );
}

const el = document.getElementById('root');
if (!el) throw new Error('#root tidak ada');
createRoot(el).render(
  <StrictMode>
    <AuthProvider>
      <ConfigGate />
    </AuthProvider>
  </StrictMode>,
);
