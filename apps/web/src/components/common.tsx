// Port helper markup mockup (pageLead, sec, lgd, kp2, chp, tcard, m4, locTabs, achievementValue).
import type { ReactNode } from 'react';
import { AchievementLegend, achievementBand, achievementLabel, type BandClass } from '../lib/achievement';
import { fmt, P } from '../lib/format';
import { achievedMetric, useConfig } from '../lib/kpi';
import { visibleSites, siteName } from '../lib/sites';
import { useAuth } from '../lib/auth';

export function PageLead({ note, children }: { readonly note: string; readonly children?: ReactNode }) {
  return (
    <div className="page-lead">
      <p>{note}</p>
      {children ? <div className="act">{children}</div> : null}
    </div>
  );
}

export function Sec({ t, s, children }: { readonly t: string; readonly s?: string; readonly children?: ReactNode }) {
  return (
    <div className="sec">
      <div>
        <h2>{t}</h2>
        {s ? (
          <div className="sb" style={{ margin: '2px 0 0' }}>
            {s}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function Lgd({ items }: { readonly items: readonly (readonly [string, string, boolean?])[] }) {
  return (
    <div className="lgd">
      {items.map(([label, color, dash]) => (
        <span key={label}>
          <svg width="26" height="8" aria-hidden="true">
            <path d="M0 4H26" stroke={color} strokeWidth="3" {...(dash ? { strokeDasharray: '5 4' } : {})} />
          </svg>{' '}
          {label}
        </span>
      ))}
    </div>
  );
}

const SH: Readonly<Record<string, string>> = { ok: '●', wa: '■', bad: '▲' };
export function Chp({ t, tone }: { readonly t: string; readonly tone: 'ok' | 'wa' | 'bad' }) {
  return (
    <span className={`chip ${tone}`}>
      <span aria-hidden="true">{SH[tone]}</span>
      {t}
    </span>
  );
}

export function CardMetric({ value, detail, tone }: { readonly value: ReactNode; readonly detail?: ReactNode; readonly tone?: string }) {
  return (
    <div className="kv metric-inline">
      <span>{value}</span>
      {detail ? (
        <>
          {' '}
          <span className={`kd ${tone ?? ''}`}>{detail}</span>
        </>
      ) : null}
    </div>
  );
}

export function Kp2({
  l,
  v,
  d,
  tone,
  href,
}: {
  readonly l: string;
  readonly v: ReactNode;
  readonly d?: ReactNode;
  readonly tone?: string;
  readonly href?: string;
}) {
  const body = (
    <>
      <div className="kl">{l}</div>
      <CardMetric value={v} {...(d !== undefined ? { detail: d } : {})} {...(tone !== undefined ? { tone } : {})} />
    </>
  );
  return href ? (
    <a className="card" href={href}>
      {body}
    </a>
  ) : (
    <div className="card">{body}</div>
  );
}

export function Tcard({
  title,
  sub,
  head,
  rows,
  cls,
}: {
  readonly title: string;
  readonly sub?: string;
  readonly head: readonly string[];
  readonly rows: readonly (readonly ReactNode[])[];
  readonly cls?: string;
}) {
  return (
    <div className={`card np ${cls ?? ''}`}>
      <div style={{ padding: '16px 18px 6px' }}>
        <h2>{title}</h2>
        {sub ? (
          <div className="sb" style={{ margin: 0 }}>
            {sub}
          </div>
        ) : null}
      </div>
      <div className="tw">
        <table>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const CATS = ['Machine', 'Man', 'Material', 'Method', 'Other'] as const;

/** Bar 4M (menit). Urutan nilai: Machine, Man, Material, Method, Other. */
export function M4({ values }: { readonly values: readonly number[] }) {
  const mx = Math.max(...values) || 1;
  return (
    <>
      {CATS.map((c, i) => (
        <div className="m4" key={c}>
          <span>{c}</span>
          <div className="tk">
            <i style={{ width: `${((values[i] ?? 0) / mx) * 100}%` }}></i>
          </div>
          <b style={{ textAlign: 'right' }}>{fmt(values[i] ?? 0)} m</b>
        </div>
      ))}
    </>
  );
}

export interface SiteCount {
  readonly active: number;
  readonly total: number;
}

export function LocTabs({
  current,
  prefix,
  counts,
}: {
  readonly current: string;
  readonly prefix: string;
  readonly counts: Readonly<Record<string, SiteCount | null>>;
}) {
  const { sites } = useConfig();
  const visible = visibleSites(useAuth().me);
  if (visible.length <= 1) return null;
  return (
    <div className="tabs" role="navigation" aria-label="Lokasi">
      {visible.map((x) => {
        const c = counts[x];
        return (
          <a key={x} className="lt" href={`#${prefix}${x}`} {...(x === current ? { 'aria-current': 'page' as const } : {})}>
            <b>{siteName(x)}</b>
            <small>
              {c
                ? `${c.active}/${c.total} line aktif`
                : sites[x] === 'on_hold'
                  ? 'On Hold'
                  : sites[x] === 'unavailable'
                    ? 'Menunggu sinkronisasi'
                    : '—'}
            </small>
          </a>
        );
      })}
    </div>
  );
}

/** Port achievementValue(): angka berwarna sesuai band. metric null = persen pencapaian langsung. */
export function AchievementValue({ value, metric = null }: { readonly value: number | null; readonly metric?: 'oee' | 'ppm' | null }) {
  const { kpi } = useConfig();
  if (value === null || !Number.isFinite(value)) return <>—</>;
  const ratio = achievedMetric(value, metric, kpi);
  return (
    <span className={achievementBand(ratio, kpi)} title={achievementLabel(ratio, kpi)}>
      {metric === 'ppm' ? fmt(value) : `${P(value)}%`}
    </span>
  );
}

export function SiteLegend() {
  const { kpi } = useConfig();
  return <AchievementLegend t={kpi} />;
}

export function useBand(): (pct: number | null) => BandClass {
  const { kpi } = useConfig();
  return (pct) => achievementBand(pct, kpi);
}

/** Kartu "belum ada data" / On Hold. */
export function Soon({ children }: { readonly children: ReactNode }) {
  return <div className="card soon">{children}</div>;
}

export function LoadError({ error, onRetry }: { readonly error: string; readonly onRetry: () => void }) {
  return (
    <div className="card soon" role="alert">
      {error}{' '}
      <button className="btn" type="button" onClick={onRetry}>
        Coba lagi
      </button>
    </div>
  );
}
