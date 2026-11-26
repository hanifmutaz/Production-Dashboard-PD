import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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

export function allowedRoute(me: Me | null, r: string): boolean {
  if (!me) return false;
  if (me.kind === 'device' && (me.screen === 'hub' || me.screen === 'executive')) return r === me.screen;
  if (me.kind === 'device') return r === 'line' || (me.line !== null && r === `line-${me.line.toLowerCase()}`);
  if (
    r === 'settings' &&
    !['config.view', 'config.edit', 'users.manage', 'devices.manage', 'audit.view'].some((p) => me.permissions.includes(p))
  )
    return false;
  if (r === 'export' && !me.permissions.includes('export.run')) return false;
  if (r !== 'settings' && !me.permissions.includes('dashboard.view')) return false;
  if (!me.menus.length) return true;
  return me.menus.some((m) => r === m || (['master', 'stoptime', 'monitoring-output', 'line'].includes(m) && r.startsWith(`${m}-`)));
}

interface AuthState {
  readonly me: Me | null;
  /** Port allowedRoute() mockup: Custom Role & perangkat kiosk. */
  allowed(route: string): boolean;
  readonly loading: boolean;
  refresh(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  can(permission: string): boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const latest = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++latest.current;
    try {
      const { data } = await api.get<Me>('/api/v3/auth/me');
      if (request === latest.current) setMe(data);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) throw e;
      if (request === latest.current) setMe(null);
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tv = me?.kind === 'device' && (me.screen === 'hub' || me.screen === 'executive');
  const user = me?.kind === 'user';
  useEffect(() => {
    if (!user && !tv) return;
    const update = (): void => {
      if (tv || document.visibilityState === 'visible') void refresh().catch(() => undefined);
    };
    const timer = window.setInterval(update, 60_000);
    if (user) {
      window.addEventListener('focus', update);
      document.addEventListener('visibilitychange', update);
    }
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [user, tv, refresh]);

  const value: AuthState = {
    me,
    loading,
    refresh,
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
      latest.current++;
      setMe(null);
    },
    can: (permission) => me?.permissions.includes(permission) ?? false,
    allowed: (r) => allowedRoute(me, r),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth di luar AuthProvider');
  return v;
}
