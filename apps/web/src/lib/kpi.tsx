import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useAuth } from './auth';
import { useApi } from './useApi';
import type { Thresholds } from './achievement';

// Settings → KPI & Ambang (kunci "config.kpi"). Default = defaultSettings() mockup.
export interface KpiRules extends Thresholds {
  readonly oee: number;
  readonly sogo: number;
  readonly shugyo: number;
  readonly ppm: number;
}
export const DEFAULT_KPI: KpiRules = { yellow: 90, green: 100, oee: 85, sogo: 85, shugyo: 85, ppm: 500 };

interface SettingRow {
  readonly key: string;
  readonly value: unknown;
  readonly version: number;
}

export interface Config {
  readonly sites: Record<string, string>;
  readonly kpi: KpiRules;
  readonly raw: ReadonlyMap<string, SettingRow>;
  readonly name: string;
  readonly department: string;
  reload(): void;
}

const Ctx = createContext<Config | null>(null);

export function ConfigProvider({ children, enabled = true }: { readonly children: ReactNode; readonly enabled?: boolean }) {
  const { can } = useAuth();
  const source = can('config.view') ? '/api/v3/settings' : can('dashboard.view') ? '/api/v3/settings/runtime' : null;
  const res = useApi<SettingRow[]>(enabled ? source : null);
  const sites = useApi<Record<string, string>>(enabled && source ? '/api/v3/sites' : null);
  useEffect(() => {
    if (!enabled || !source) return;
    const id = setInterval(sites.reload, 60000);
    return () => clearInterval(id);
  }, [enabled, source, sites.reload]);
  const raw = new Map((res.data ?? []).map((r) => [r.key, r]));
  const kpiValue = raw.get('config.kpi')?.value as Partial<KpiRules> | undefined;
  const general = raw.get('config.general')?.value as { name?: string; department?: string } | undefined;
  const theme = (raw.get('config.display')?.value as { theme?: string } | undefined)?.theme;
  // Tema default dari Settings → Tampilan, hanya bila pengguna belum memilih tema sendiri.
  useEffect(() => {
    const saved = ((): string | null => {
      try {
        return localStorage.getItem('cmTheme');
      } catch {
        return null;
      }
    })();
    if (!saved && (theme === 'light' || theme === 'dark')) document.documentElement.dataset['theme'] = theme;
  }, [theme]);
  const value: Config = {
    sites: sites.data ?? {},
    kpi: { ...DEFAULT_KPI, ...(kpiValue ?? {}) },
    raw,
    name: general?.name || 'Dashboard Produksi',
    department: general?.department || 'Departemen Produksi',
    reload: res.reload,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConfig(): Config {
  const v = useContext(Ctx);
  if (!v) throw new Error('useConfig di luar ConfigProvider');
  return v;
}

/** Port achievedMetric(): nilai metrik → persen pencapaian terhadap target KPI. */
export function achievedMetric(value: number | null, metric: 'oee' | 'ppm' | null, k: KpiRules): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (metric === 'ppm') return value === 0 ? k.green : Math.min(1000, (k.ppm / value) * 100);
  if (metric === 'oee') return k.oee > 0 ? (value / k.oee) * 100 : value;
  return value;
}
