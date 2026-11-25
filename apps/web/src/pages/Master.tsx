// Port masterView/masterTrend/masterLineTable mockup → data API (summary, trend, line-metrics).
import { useState, type ReactNode } from 'react';
import type { LineDayMetrics, LineStatus, SummaryTotals } from '@v3/shared';
import { AchievementValue, Chp, LocTabs, M4, PageLead, SiteLegend, Soon, Tcard, useBand, type SiteCount } from '../components/common';
import { HubTrend } from '../components/HubTrend';
import { achievementLabel } from '../lib/achievement';
import { useAuth } from '../lib/auth';
import { addD, addM, lastOfMonth, MIN_M } from '../lib/dates';
import { fd, fmt, MON, P } from '../lib/format';
import { Icon } from '../lib/icons';
import { achievedMetric, useConfig } from '../lib/kpi';
import { siteName } from '../lib/sites';
import { useApi } from '../lib/useApi';

type Summary = SummaryTotals & { readonly hasData: boolean };
interface TrendDay {
  readonly date: string;
  readonly plan: number;
  readonly actual: number;
  readonly hasData: boolean;
}
interface LineMetrics {
  readonly lines: readonly { readonly line_code: string; readonly product: string }[];
  readonly rows: readonly LineDayMetrics[];
}
interface Current {
  readonly lines: readonly { readonly line: string; readonly status: LineStatus }[];
}

const pctOf = (a: number, p: number): number | null => (p > 0 ? (a / p) * 100 : null);

function Stat({
  label,
  value,
  unit,
  tone,
  href,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly unit?: string;
  readonly tone?: string;
  readonly href?: string;
}) {
  const inner = (
    <>
      <span className="kl">{label}</span>
      <strong className="metric-inline">
        <span>{value}</span>
        {unit ? (
          <>
            {' '}
            <small>{unit}</small>
          </>
        ) : null}
      </strong>
    </>
  );
  return href ? (
    <a className={`mn master-stat ${tone ?? ''}`} href={href}>
      {inner}
    </a>
  ) : (
    <div className={`mn master-stat ${tone ?? ''}`}>{inner}</div>
  );
}

function Step({
  scope,
  label,
  prev,
  next,
  onStep,
}: {
  readonly scope: 'month' | 'day';
  readonly label: string;
  readonly prev: boolean;
  readonly next: boolean;
  readonly onStep: (n: number) => void;
}) {
  const what = scope === 'month' ? 'Bulan' : 'Tanggal';
  return (
    <div className="master-step">
      <button
        className="btn"
        type="button"
        data-master-step={`${scope}:-1`}
        aria-label={`${what} sebelumnya`}
        disabled={!prev}
        onClick={() => onStep(-1)}
      >
        <Icon name="back" size={16} />
      </button>
      <b>{label}</b>
      <button
        className="btn"
        type="button"
        data-master-step={`${scope}:1`}
        aria-label={`${what} berikutnya`}
        disabled={!next}
        onClick={() => onStep(1)}
      >
        <Icon name="next" size={16} />
      </button>
    </div>
  );
}

const LINE_FILTERS: [string, string][] = [
  ['all', 'Semua'],
  ['bad', 'Bermasalah'],
  ['off', 'Tidak Running'],
  ['run', 'Running'],
];

function LineTable({
  day,
  rows,
  status,
}: {
  readonly day: string;
  readonly rows: readonly LineDayMetrics[];
  readonly status: ReadonlyMap<string, boolean>;
}) {
  const [q, setQ] = useState('');
  const [flt, setFlt] = useState('all');
  const [sort, setSort] = useState('def');
  const band = useBand();
  const list = rows
    .map((r) => ({ ...r, run: status.get(r.line) ?? r.reports > 0, b: pctOf(r.actual, r.plan) }))
    .filter((x) => {
      if (!x.line.toLowerCase().includes(q.toLowerCase())) return false;
      if (flt === 'off') return !x.run;
      if (flt === 'run') return x.run;
      if (flt === 'bad') return x.run && ((x.b ?? 100) < 50 || x.reject > 0 || x.stoptime >= 30);
      return true;
    })
    .sort((a, b) =>
      sort === 'bh' ? (b.b ?? -1) - (a.b ?? -1) : sort === 'bl' ? (a.b ?? 1e9) - (b.b ?? 1e9) : sort === 'out' ? b.actual - a.actual : 0,
    );
  return (
    <div className="card np master-line-table">
      <div style={{ padding: '16px 18px 10px' }}>
        <div className="lh">
          <h2>
            Status Line Harian{' '}
            <span className="sb" style={{ display: 'inline', fontWeight: 400 }}>
              · {fd(day)}
            </span>
          </h2>
        </div>
        <div className="chips">
          <label style={{ flex: '1 1 200px', maxWidth: 260 }}>
            <span className="sr">Cari nama line</span>
            <input
              type="search"
              id="q"
              placeholder="Cari nama line…"
              style={{ width: '100%' }}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          {LINE_FILTERS.map(([k, l]) => (
            <button key={k} className="chip b" type="button" data-flt={k} aria-pressed={flt === k} onClick={() => setFlt(k)}>
              {l}
            </button>
          ))}
          <label style={{ marginLeft: 'auto' }}>
            <span className="sr">Urutkan</span>
            <select id="msel" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="def">Urutkan: Default</option>
              <option value="bh">Beki tertinggi</option>
              <option value="bl">Beki terendah</option>
              <option value="out">Output</option>
            </select>
          </label>
        </div>
      </div>
      <div className="tw">
        <table>
          <thead>
            <tr>
              {['Line', 'Status', 'Output plan', 'Output actual', '% Bekidoritsu', 'Shugyo', 'Sogo', 'OEE', 'Reject', 'Total stoptime'].map(
                (h) => (
                  <th key={h}>{h}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody id="mlrows">
            {list.length ? (
              list.map((x) => (
                <tr key={x.line}>
                  <td>
                    <a href={`#line-${x.line.toLowerCase()}`} style={{ color: 'var(--acc)' }}>
                      {x.line}
                    </a>
                  </td>
                  <td>{x.run ? <Chp t="Running" tone="ok" /> : <Chp t="Tidak Running" tone="bad" />}</td>
                  <td>{fmt(x.plan)}</td>
                  <td>{fmt(x.actual)}</td>
                  <td className={x.plan > 0 ? band(x.b) : ''}>{x.plan > 0 && x.b !== null ? `${P(x.b)}%` : '—'}</td>
                  <td>{x.reports ? `${fmt(x.shugyo)} m` : '—'}</td>
                  <td>{x.reports ? `${fmt(x.sogo)} m` : '—'}</td>
                  <td>
                    <AchievementValue value={x.oee} metric="oee" />
                  </td>
                  <td>{x.reject}</td>
                  <td>{fmt(x.stoptime)} m</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', color: 'var(--dim)' }}>
                  Tidak ada line yang cocok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function useSiteCounts(today: string): Record<string, SiteCount | null> {
  const s = useApi<Summary>(`/api/v3/reporting/summary/range?start=${today}&end=${today}&location=internal`);
  const lines = useApi<readonly unknown[]>('/api/v3/lines');
  const total = lines.data?.length ?? 0;
  return { internal: { active: s.data?.lines_running ?? 0, total }, sgp: null, systech: null };
}

export function Master({ site }: { readonly site: string }) {
  const { me } = useAuth();
  const { kpi } = useConfig();
  const band = useBand();
  const today = me?.today ?? '';
  const [month, setMonth] = useState(today.slice(0, 7));
  const [day, setDay] = useState(today);
  const counts = useSiteCounts(today);
  const internal = site === 'internal';
  const monthEnd = lastOfMonth(month);
  const limit = monthEnd < today ? monthEnd : today;
  const monthSum = useApi<Summary>(internal ? `/api/v3/reporting/summary/range?start=${month}-01&end=${limit}&location=internal` : null);
  const daySum = useApi<Summary>(internal ? `/api/v3/reporting/summary/range?start=${day}&end=${day}&location=internal` : null);
  const trend = useApi<{ days: TrendDay[] }>(
    internal ? `/api/v3/reporting/trend/range?start=${month}-01&end=${monthEnd}&location=internal` : null,
  );
  const metrics = useApi<LineMetrics>(internal ? `/api/v3/reporting/line-metrics?start=${day}&end=${day}&location=internal` : null);
  const current = useApi<Current>(internal && day === today ? '/api/v3/reporting/summary/current?location=internal' : null);

  if (!internal) {
    return (
      <div className="page">
        <LocTabs current={site} prefix="master-" counts={counts} />
        <Soon>Lokasi ini On Hold — data subcont belum tersambung (push-sync aktif di Fase Subcont).</Soon>
      </div>
    );
  }

  const trendDays = (trend.data?.days ?? []).filter((point) => point.date >= `${month}-01` && point.date <= limit);
  const m = monthSum.data;
  const d = daySum.data;
  const dayPct = d ? pctOf(d.output_actual, d.output_plan) : null;
  const monthLabel = `${MON[Number(month.slice(5)) - 1] ?? ''} ${month.slice(0, 4)}`;
  const stopHref = `#stoptime-${site}`;
  const rows = metrics.data?.rows ?? [];
  const statusMap = new Map((current.data?.lines ?? []).map((l) => [l.line, l.status === 'running']));
  const link = (code: string): ReactNode => (
    <a className="pickline" href={`#line-${code.toLowerCase()}`}>
      {code}
    </a>
  );
  const empty = (n: number): ReactNode[][] => [
    [<span style={{ color: 'var(--dim)' }}>Belum ada data</span>, ...Array<string>(n - 1).fill('—')],
  ];
  const active = rows.filter((r) => r.reports > 0);
  const outputRows = active
    .filter((r) => r.plan > 0)
    .sort((a, b) => (pctOf(a.actual, a.plan) ?? 0) - (pctOf(b.actual, b.plan) ?? 0))
    .slice(0, 7)
    .map((r) => [link(r.line), <AchievementValue value={pctOf(r.actual, r.plan)} />, `${fmt(r.actual)} / ${fmt(r.plan)}`]);
  const rejectRows = active
    .filter((r) => r.reject > 0)
    .sort((a, b) => b.reject - a.reject)
    .slice(0, 7)
    .map((r) => [link(r.line), <b className="bad">{fmt(r.reject)} pcs</b>, fmt(r.actual)]);
  const stopRows = active
    .filter((r) => r.stoptime > 0)
    .sort((a, b) => b.stoptime - a.stoptime)
    .slice(0, 7)
    .map((r) => [
      link(r.line),
      <b className="bad">{fmt(r.stoptime)} m</b>,
      `${fmt(r.stoptime_4m[0])} m`,
      `${fmt(r.stoptime_4m[2])} m`,
      `${fmt(r.stoptime_4m[3])} m`,
      `${fmt(r.stoptime_4m[1])} m`,
    ]);
  const lossPanel = (title: string, values: readonly number[]): ReactNode => (
    <section className="card">
      <div className="master-loss-head">
        <h2>{title}</h2>
        <a className="btn" href={stopHref} aria-label={`Detail ${title} untuk ${siteName(site)}`}>
          <Icon name="clock" size={14} />
          Detail
        </a>
      </div>
      <M4 values={values} />
    </section>
  );
  const stepMonth = (n: number): void => {
    const next = addM(month, n);
    if (next < MIN_M || next > today.slice(0, 7)) return;
    setMonth(next);
    const end = lastOfMonth(next);
    setDay(end < today ? end : today);
  };
  const stepDay = (n: number): void => {
    const next = addD(day, n);
    if (next < `${month}-01` || next > limit) return;
    setDay(next);
  };
  const oeeRatio = achievedMetric(d?.oee ?? null, 'oee', kpi);

  return (
    <div className="page">
      <div className="master-board">
        <PageLead note="Data i-Reporter">
          <a className="btn" href={`#monitoring-output-${site}`}>
            <Icon name="table" size={16} />
            Monitoring Output
          </a>
        </PageLead>
        <LocTabs current={site} prefix="master-" counts={counts} />
        <section className="card master-monthly">
          <div className="master-frame-head">
            <h2>KPI Bulanan</h2>
            <span>
              {month.slice(5)}/{month.slice(0, 4)}
            </span>
          </div>
          <div className="master-kpis">
            <Stat label="Output actual" value={m ? fmt(m.output_actual) : '—'} unit="pcs" tone="accent" />
            <Stat label="Output plan" value={m ? fmt(m.output_plan) : '—'} unit="pcs" />
            <Stat label="Total qty reject" value={m ? fmt(m.qty_reject) : '—'} unit="pcs" tone="caution" />
            <Stat label="Total reject ppm" value={m?.reject_ppm !== null && m ? fmt(m.reject_ppm ?? 0) : '—'} unit="ppm" tone="caution" />
            <Stat label="Total stop time" value={m ? fmt(m.stoptime_total) : '—'} unit="menit" tone="loss" href={stopHref} />
          </div>
        </section>
        <div className="master-middle">
          <section className="card master-chart-card">
            <div className="master-chart-tools">
              <div>
                <h2>Tren Output Harian</h2>
                <div className="master-caption">
                  {fd(`${month}-01`)} sampai {fd(limit)} · pcs
                </div>
              </div>
              <Step scope="month" label={monthLabel} prev={month > MIN_M} next={month < today.slice(0, 7)} onStep={stepMonth} />
            </div>
            <div className="master-chart-summary">
              <span className="master-chart-date">{fd(day)}</span>
              <span>
                <i className="master-chart-key"></i>Actual <b>{d ? fmt(d.output_actual) : '—'}</b>
              </span>
              <span>
                <i className="master-chart-key plan"></i>Plan <b>{d ? fmt(d.output_plan) : '—'}</b>
              </span>
              {dayPct === null ? null : (
                <span className={`master-chart-pct ${band(dayPct)}`} title={achievementLabel(dayPct, kpi)}>
                  {P(dayPct)}%
                </span>
              )}
            </div>
            <HubTrend
              key={month}
              days={trendDays.map((point) => point.date)}
              series={[{ site, name: siteName(site), values: trendDays.map((point) => (point.hasData ? point.actual : null)) }]}
              onPick={setDay}
            />
          </section>
          <div className="master-loss-stack">
            {lossPanel('Stoptime 4M — Bulanan', m?.stoptime_4m ?? [0, 0, 0, 0, 0])}
            {lossPanel('Stoptime 4M — Harian', d?.stoptime_4m ?? [0, 0, 0, 0, 0])}
          </div>
        </div>
        <section aria-label="Ranking Line Harian">
          <div className="master-rank-head">
            <h2>Ranking Line — Harian</h2>
            <Step scope="day" label={fd(day)} prev={day > `${month}-01`} next={day < limit} onStep={stepDay} />
          </div>
          <div className="master-rank-grid">
            <Tcard title="Top Output Terendah" head={['Line', 'Bekidoritsu', 'Output']} rows={outputRows.length ? outputRows : empty(3)} />
            <Tcard title="Top Reject Tertinggi" head={['Line', 'Reject', 'Output']} rows={rejectRows.length ? rejectRows : empty(3)} />
            <Tcard
              title="Top Stoptime Tertinggi"
              head={['Line', 'Stoptime', 'Machine', 'Material', 'Method', 'Man']}
              rows={stopRows.length ? stopRows : empty(6)}
            />
          </div>
        </section>
        <section className="master-daily">
          <div className="master-frame-head">
            <h2>KPI Harian</h2>
            <span>{fd(day)}</span>
          </div>
          <div className="master-kpis daily">
            <Stat label="Total output" value={d ? `${fmt(d.output_actual)} / ${fmt(d.output_plan)}` : '—'} unit="pcs" tone="accent" />
            <Stat label="Bekidoritsu" value={dayPct === null ? '—' : `${P(dayPct)}%`} tone={band(dayPct)} />
            <Stat label="Overall OEE" value={d?.oee === null || !d ? '—' : `${P(d.oee)}%`} tone={band(oeeRatio)} />
            <Stat label="Line aktif" value={`${active.length} / ${rows.length}`} tone="caution" />
          </div>
        </section>
        <div className="master-target-note">
          <SiteLegend />
        </div>
        <LineTable day={day} rows={rows} status={statusMap} />
      </div>
    </div>
  );
}
