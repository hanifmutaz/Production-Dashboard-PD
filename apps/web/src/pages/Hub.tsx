// Port V.hub + hubDaily/hubMonthly/hubK/hubT/hubLocationCharts mockup → data API.
import { useState, type ReactNode } from 'react';
import type { SummaryTotals } from '@v3/shared';
import { AchievementValue, Chp, Kp2, Lgd, PageLead, Sec, SiteLegend, useBand } from '../components/common';
import { HubTrend } from '../components/HubTrend';
import { DayPicker, RangePicker, rangeLabel } from '../components/Picker';
import { achievementLabel } from '../lib/achievement';
import { useAuth } from '../lib/auth';
import { addD, dayList, MIN_D, presetRange, type Range } from '../lib/dates';
import { fd, fmt } from '../lib/format';
import { useConfig } from '../lib/kpi';
import { SITES, siteName, SITE_INFO } from '../lib/sites';
import { useApi } from '../lib/useApi';

type Summary = SummaryTotals & { readonly hasData: boolean };
interface Trend {
  readonly days: readonly { readonly date: string; readonly actual: number; readonly hasData: boolean }[];
}

interface Row {
  readonly site: string;
  readonly ok: boolean;
  readonly s: Summary | null;
}

const pctOf = (a: number, p: number): number | null => (p > 0 ? (a / p) * 100 : null);

function HubKpis({ rows }: { readonly rows: readonly Row[] }) {
  const band = useBand();
  const matched = rows.filter((r) => r.s);
  const sum = (f: (s: Summary) => number): number => matched.reduce((a, r) => a + (r.s ? f(r.s) : 0), 0);
  const plan = sum((s) => s.output_plan);
  const actual = sum((s) => s.output_actual);
  const pct = pctOf(actual, plan);
  const rej = sum((s) => s.qty_reject);
  const ppm = actual + rej > 0 ? Math.round((rej / (actual + rej)) * 1e6) : null;
  const has = matched.length > 0;
  return (
    <div className="kpis hub-kpis">
      <Kp2 l="Output plan" v={fmt(plan)} d="pcs" tone="" />
      <Kp2 l="Output actual" v={has ? fmt(actual) : '—'} d="pcs" tone="" />
      <Kp2 l="Bekidoritsu" v={<AchievementValue value={pct} />} d={achievementLabel(pct)} tone={band(pct)} />
      <Kp2 l="Sogo" v={has ? fmt(sum((s) => s.sogo)) : '—'} d="menit" tone="" />
      <Kp2 l="Shugyo" v={has ? fmt(sum((s) => s.shugyo)) : '—'} d="menit" tone="" />
      <Kp2 l="Reject ppm" v={<AchievementValue value={ppm} metric="ppm" />} d="gabungan lokasi" tone="" />
      <Kp2 l="Deviasi (Plan − Actual)" v={has ? fmt(plan - actual) : '—'} d="pcs" tone={band(pct)} />
    </div>
  );
}

function HubTable({ rows, day }: { readonly rows: readonly Row[]; readonly day: boolean }) {
  const head = [
    'Lokasi',
    'Status koneksi',
    ...(day ? ['Line aktif'] : []),
    'Output plan',
    'Output actual',
    'Bekidoritsu',
    'Sogo',
    'Shugyo',
    'Jumlah reject',
    'Reject ppm',
    'Total stoptime',
    'OEE',
  ];
  const isNew = (h: string): boolean => /Sogo|Shugyo|ppm/.test(h);
  return (
    <table>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h}>
              {h}
              {isNew(h) ? <span className="nw">BARU</span> : null}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(({ site, ok, s }) => {
          const cells: ReactNode[] = [
            <>
              <span className="dot" style={{ background: SITE_INFO[site as 'internal'].color }}></span>
              <a className="hub-location" href={`#master-${site}`}>
                {siteName(site)}
              </a>
            </>,
            ok ? <Chp t="Terhubung" tone="ok" /> : 'On Hold',
          ];
          if (day) cells.push(s ? `${s.lines_running}/${s.lines_total}` : '—');
          cells.push(
            s ? fmt(s.output_plan) : '—',
            s ? fmt(s.output_actual) : '—',
            <AchievementValue value={s ? pctOf(s.output_actual, s.output_plan) : null} />,
            s ? `${fmt(s.sogo)} m` : '—',
            s ? `${fmt(s.shugyo)} m` : '—',
            s ? fmt(s.qty_reject) : '—',
            <AchievementValue value={s?.reject_ppm ?? null} metric="ppm" />,
            s ? `${fmt(s.stoptime_total)} m` : '—',
            <AchievementValue value={s?.oee ?? null} metric="oee" />,
          );
          return (
            <tr key={site}>
              {cells.map((c, i) => (
                <td key={i}>{c}</td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function LocationCharts({
  rows,
  days,
  trend,
  label,
}: {
  readonly rows: readonly Row[];
  readonly days: readonly string[];
  readonly trend: Trend | null;
  readonly label: string;
}) {
  const band = useBand();
  const maxOutput = Math.max(1, ...rows.flatMap((r) => (r.s ? [r.s.output_plan, r.s.output_actual] : [0])));
  const width = (v: number, max: number): number => Math.max(0, Math.min(100, (v / max) * 100));
  const track = (v: number, max: number, cls = '', b = ''): ReactNode => (
    <span className={`hub-comparison-track ${cls} ${b}`} aria-hidden="true">
      <i style={{ width: `${width(v, max)}%` }}></i>
    </span>
  );
  const byDate = new Map((trend?.days ?? []).map((d) => [d.date, d]));
  const series = SITES.map((site) => ({
    site,
    name: siteName(site),
    values: days.map((d) => {
      const x = site === 'internal' ? byDate.get(d) : undefined;
      return x?.hasData ? x.actual : null;
    }),
  }));
  const trendLabel = days.length === 1 ? fd(days[0] ?? '') : rangeLabel({ f: days[0] ?? '', t: days.at(-1) ?? '', p: '' });
  return (
    <div className="hub-output-charts">
      <section className="card hub-output-trend">
        <h2>Tren Output Harian per Lokasi</h2>
        <div className="sb">{trendLabel} · pcs</div>
        <HubTrend days={days} series={series} />
      </section>
      <div className="hub-output-side">
        <section className="card">
          <h2>Output Actual vs Plan per Lokasi</h2>
          <div className="sb">{label} · pcs</div>
          {rows.map(({ site, s }) => (
            <div className="hub-comparison" key={site}>
              <span className="hub-comparison-label">{siteName(site)}</span>
              <div>
                {track(s?.output_plan ?? 0, maxOutput, 'is-plan')}
                {track(s?.output_actual ?? 0, maxOutput)}
              </div>
              <div className="hub-comparison-values">
                <small>
                  <span className="sr">Plan </span>
                  {s ? fmt(s.output_plan) : '—'}
                </small>
                <strong>
                  <span className="sr">Actual </span>
                  {s ? fmt(s.output_actual) : '—'}
                </strong>
              </div>
            </div>
          ))}
          <Lgd
            items={[
              ['Plan', 'var(--hub-plan-bar)'],
              ['Actual', 'var(--acc)'],
            ]}
          />
        </section>
        <section className="card">
          <h2>Bekidoritsu per Lokasi</h2>
          <div className="sb">{label}</div>
          {rows.map(({ site, s }) => {
            const p = s ? pctOf(s.output_actual, s.output_plan) : null;
            return (
              <div className="hub-comparison" key={site}>
                <span className="hub-comparison-label">{siteName(site)}</span>
                {track(p ?? 0, 105, 'hub-comparison-target', band(p))}
                <strong className="hub-comparison-values">
                  <AchievementValue value={p} />
                </strong>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

interface AlertRule {
  readonly name: string;
  readonly metric: 'achievement' | 'reject' | 'stop';
  readonly site?: string;
  readonly threshold: number;
  readonly active: boolean;
}

export function currentAlerts(rules: readonly AlertRule[], rows: readonly Row[]) {
  return rules
    .filter((r) => r.active)
    .flatMap((rule) =>
      rows
        .filter((row) => row.s && (!rule.site || rule.site === row.site))
        .flatMap((row) => {
          const s = row.s as Summary;
          const value = { achievement: pctOf(s.output_actual, s.output_plan), reject: s.reject_ppm, stop: s.stoptime_total }[rule.metric];
          const hit =
            value !== null && Number.isFinite(value) && (rule.metric === 'achievement' ? value < rule.threshold : value > rule.threshold);
          return hit ? [{ rule, site: row.site, value: value as number }] : [];
        }),
    );
}

function AlertPreview({ rows, date }: { readonly rows: readonly Row[]; readonly date: string }) {
  const { raw } = useConfig();
  const rules = ((raw.get('config.alerts')?.value as { rows?: AlertRule[] } | undefined)?.rows ?? []) as AlertRule[];
  const alerts = currentAlerts(rules, rows);
  if (!alerts.length) return null;
  return (
    <section className="settings-card">
      <header>
        <h3>Peringatan · {fd(date)}</h3>
      </header>
      <p className="settings-help">{alerts.length} peringatan.</p>
      <ul className="settings-alerts">
        {alerts.map(({ rule, site, value }) => (
          <li key={`${rule.name}-${site}`}>
            <strong>{rule.name}</strong>
            <span>
              {siteName(site)} · {fmt(value)}
              {rule.metric === 'achievement' ? '%' : rule.metric === 'reject' ? ' ppm' : ' menit'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Hub() {
  const { me } = useAuth();
  const today = me?.today ?? '';
  const { raw } = useConfig();
  const initialTab = (raw.get('config.display')?.value as { hub?: string } | undefined)?.hub === 'monthly' ? 'monthly' : 'daily';
  const [period, setPeriod] = useState<'daily' | 'monthly'>(initialTab);
  const [day, setDay] = useState(today);
  const [rng, setRng] = useState<Range>(() => presetRange('mtd', today));
  const start = period === 'daily' ? day : rng.f;
  const end = period === 'daily' ? day : rng.t;
  const trendFrom = period === 'daily' ? (addD(day, -6) < MIN_D ? MIN_D : addD(day, -6)) : rng.f;
  const summary = useApi<Summary>(`/api/v3/reporting/summary/range?start=${start}&end=${end}&location=internal`);
  const trend = useApi<Trend>(`/api/v3/reporting/trend/range?start=${trendFrom}&end=${end}&location=internal`);
  const rows: Row[] = SITES.map((site) => ({ site, ok: site === 'internal', s: site === 'internal' ? summary.data : null }));
  const label = period === 'daily' ? fd(day) : rangeLabel(rng);
  const tabs: [typeof period, string][] = [
    ['daily', 'Harian'],
    ['monthly', 'Bulanan'],
  ];
  return (
    <div className="page">
      <PageLead note="Data i-Reporter · Subcont On Hold" />
      <div className="hub-periods">
        <div className="hub-tabs" role="tablist" aria-label="Periode Master Dashboard">
          {tabs.map(([k, l]) => (
            <button
              key={k}
              type="button"
              className="hub-tab"
              role="tab"
              id={`hub-tab-${k}`}
              data-hub-period={k}
              aria-controls={`hub-panel-${k}`}
              aria-selected={period === k}
              tabIndex={period === k ? 0 : -1}
              onClick={() => setPeriod(k)}
              onKeyDown={(e) => {
                if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                  e.preventDefault();
                  setPeriod(e.key === 'Home' ? 'daily' : e.key === 'End' ? 'monthly' : period === 'daily' ? 'monthly' : 'daily');
                }
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="hub-period-picker">
          {period === 'daily' ? (
            <DayPicker value={day} today={today} onChange={setDay} />
          ) : (
            <RangePicker value={rng} today={today} onChange={setRng} />
          )}
        </div>
      </div>
      <div className="master-target-note">
        <SiteLegend />
      </div>
      {tabs.map(([k]) => (
        <section className="hub-panel" id={`hub-panel-${k}`} role="tabpanel" aria-labelledby={`hub-tab-${k}`} hidden={period !== k} key={k}>
          {period === k ? (
            <>
              <Sec t={k === 'daily' ? 'Kinerja Produksi Harian' : 'Kinerja Produksi Periode'} s="akumulasi seluruh lokasi">
                {summary.error ? (
                  <button className="btn" type="button" onClick={summary.reload}>
                    Muat ulang
                  </button>
                ) : null}
              </Sec>
              {summary.error ? (
                <p className="sb" role="alert">
                  {summary.error}
                </p>
              ) : null}
              <HubKpis rows={rows} />
              <LocationCharts rows={rows} days={dayList(trendFrom, end)} trend={trend.data} label={label} />
              <div className="card np">
                <div style={{ padding: '16px 18px 6px' }}>
                  <h2>{k === 'daily' ? 'Ringkasan Kinerja Harian per Lokasi' : 'Ringkasan Kinerja Periode per Lokasi'}</h2>
                  <div className="sb" style={{ margin: 0 }}>
                    {label}
                  </div>
                </div>
                <div className="tw">
                  <HubTable rows={rows} day={k === 'daily'} />
                </div>
              </div>
            </>
          ) : null}
        </section>
      ))}
      <AlertPreview rows={rows} date={end} />
    </div>
  );
}
