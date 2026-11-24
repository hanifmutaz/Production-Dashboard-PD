import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Icon } from '../lib/icons';
import { isDarkTheme, toggleTheme } from '../lib/theme';

// Layout login mockup. Pilihan role demo DIGANTI username/password (login asli di server).
export function Login() {
  const { login } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pairMsg, setPairMsg] = useState('');
  const [dark, setDark] = useState(isDarkTheme);

  const submit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await login(String(f.get('username') ?? ''), String(f.get('password') ?? ''));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login gagal. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  const pair = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPairMsg('');
    try {
      const res = await api.post<{ token: string }>('/api/v3/auth/pair', {
        code: String(f.get('code') ?? ''),
        name: navigator.userAgent.slice(0, 60) || 'iPad',
      });
      if (res.data) localStorage.setItem('v3DeviceToken', res.data.token);
      setPairMsg('Perangkat terhubung. Mode kiosk akan aktif setelah halaman kiosk tersedia.');
    } catch (err) {
      setPairMsg(err instanceof ApiError ? err.message : 'Pairing gagal.');
    }
  };

  const themeLabel = dark ? 'Mode terang' : 'Mode gelap';
  return (
    <section className="login-screen" id="demo-login" aria-labelledby="login-title">
      <div className="login-visual">
        <div className="login-brand">
          <div className="logo" role="img" aria-label="Hirose"></div>
          <div className="login-brand-copy">
            <b>Dashboard Produksi</b>
            <small data-department="">Departemen Produksi</small>
          </div>
        </div>
      </div>
      <div className="login-card">
        <div className="login-content">
          <header>
            <div className="login-toolbar">
              <span className="login-demo">Login</span>
              <button
                className="ib"
                id="login-theme"
                type="button"
                title={themeLabel}
                aria-label={`Ganti ke ${themeLabel.toLowerCase()}`}
                onClick={() => {
                  toggleTheme();
                  setDark(isDarkTheme());
                }}
              >
                <Icon name={dark ? 'sun' : 'moon'} />
              </button>
            </div>
            <h1 className="login-title" id="login-title">
              Masuk ke dashboard
            </h1>
          </header>
          <form id="demo-login-form" className="login-form" onSubmit={(e) => void submit(e)}>
            <label className="fld">
              Username
              <input name="username" required autoComplete="username" maxLength={60} />
            </label>
            <label className="fld">
              Password
              <input name="password" type="password" required autoComplete="current-password" maxLength={200} />
            </label>
            <button type="submit" className="btn pri login-submit" id="demo-enter" disabled={busy} aria-busy={busy}>
              {busy ? 'Memproses…' : 'Masuk'}
            </button>
            <p className="sb" role="alert">
              {error}
            </p>
          </form>
          <form id="pair-form" className="login-form" onSubmit={(e) => void pair(e)}>
            <label className="fld">
              Device Pairing Code
              <input name="code" required placeholder="XXXX-XXXX" autoComplete="off" />
            </label>
            <button className="btn login-submit">Hubungkan iPad</button>
            <p className="sb" id="pair-error" role="alert">
              {pairMsg}
            </p>
          </form>
          <p className="login-notice">
            <span aria-hidden="true">
              <Icon name="shield" />
            </span>
            Akses dicatat di audit log. Hubungi admin bila lupa password.
          </p>
        </div>
      </div>
    </section>
  );
}
