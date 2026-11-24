import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';

export interface Me {
  readonly kind: 'user' | 'device';
  readonly name: string;
  readonly role: string;
  readonly permissions: readonly string[];
  readonly locations: readonly string[];
}

interface AuthState {
  readonly me: Me | null;
  readonly loading: boolean;
  login(username: string, password: string): Promise<void>;
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

  const value: AuthState = {
    me,
    loading,
    async login(username, password) {
      await api.post('/api/v3/auth/login', { username, password });
      await refresh();
    },
    async logout() {
      await api.post('/api/v3/auth/logout').catch(() => undefined);
      setMe(null);
    },
    can: (permission) => me?.permissions.includes(permission) ?? false,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth di luar AuthProvider');
  return v;
}
