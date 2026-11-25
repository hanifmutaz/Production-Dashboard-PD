import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';

export interface Me {
  readonly kind: 'user' | 'device';
  readonly name: string;
  readonly role: string;
  readonly permissions: readonly string[];
  readonly locations: readonly string[];
  /** Menu Custom Role (kosong = semua). */
  readonly menus: readonly string[];
  /** Perangkat kiosk: line yang ditampilkan. */
  readonly screen?: 'line' | 'hub' | 'executive' | null;
  readonly line: string | null;
  /** Tanggal hari ini menurut server (WIB, YYYY-MM-DD). */
  readonly today: string;
  /** Jam server WIB (ISO, field UTC = jam dinding WIB). */
  readonly now: string;
}

interface AuthState {
  readonly me: Me | null;
  /** Port allowedRoute() mockup: Custom Role & perangkat kiosk. */
  allowed(route: string): boolean;
  readonly loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  can(permission: string): boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setMe((await api.get<Me>('/api/v3/auth/me')).data);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) throw e;
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tv = me?.kind === 'device' && (me.screen === 'hub' || me.screen === 'executive');
  useEffect(() => {
    if (!tv) return;
    const timer = window.setInterval(() => { void refresh().catch(() => undefined); }, 60_000);
    return () => window.clearInterval(timer);
  }, [tv, refresh]);

  const value: AuthState = {
    me,
    loading,
    async login(email, password) {
      await api.post('/api/v3/auth/login', { email, password });
      await refresh();
    },
    async logout() {
      await api.post('/api/v3/auth/logout').catch(() => undefined);
      try {
        localStorage.removeItem('v3DeviceToken');
      } catch {
        /* abaikan */
      }
      setMe(null);
    },
    can: (permission) => me?.permissions.includes(permission) ?? false,
    allowed(r) {
      if (!me) return false;
      if (tv) return r === me.screen;
      if (me.kind === 'device') return r === 'line' || (me.line !== null && r === `line-${me.line.toLowerCase()}`);
      if (!me.menus.length) return true;
      return me.menus.some((m) => r === m || (['master', 'stoptime', 'monitoring-output', 'line'].includes(m) && r.startsWith(`${m}-`)));
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth di luar AuthProvider');
  return v;
}
