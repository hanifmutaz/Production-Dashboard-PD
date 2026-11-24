// Port <production-monitoring> mockup (web component + shadow DOM + template CSS) → data API.
// CSS template dimuat HANYA di shadow root, sama seperti mockup.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LineDayMetrics } from '@v3/shared';
import templateCss from '../styles/monitoring-template.css?inline';
import { AchievementCaption, AchievementLegend, achievementBand, achievementLabel } from '../lib/achievement';
import { useAuth } from '../lib/auth';
import { dayList, lastOfMonth, pad } from '../lib/dates';
import { MON } from '../lib/format';
import { Icon } from '../lib/icons';
import { useConfig } from '../lib/kpi';
import { siteName, SITES } from '../lib/sites';
import { useApi } from '../lib/useApi';

const Host = 'production-monitoring' as unknown as 'div';

const numberFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const oneDecimal = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const compactNumber = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const fmt = (x: number | null | undefined): string =>
  x === null || x === undefined ? '—' : numberFormat.format(Math.abs(x) < 0.000001 ? 0 : x);
const signed = (x: number | null): string => (x !== null && x > 0 ? `+${fmt(x)}` : fmt(x));
const grade = (x: number | null): string => (x === null ? '' : x < -0.000001 ? 'neg' : x > 0.000001 ? 'pos' : '');
const pct = (a: number | null, t: number | null): string =>
  t !== null && t > 0 && a !== null ? `${oneDecimal.format((a / t) * 100)}%` : '—';
const ratio = (a: number | null, t: number | null): number | null => (t !== null && t > 0 && a !== null ? (a / t) * 100 : null);
const compactQty = (v: number): string => (v < 1000 ? fmt(v) : `${compactNumber.format(v / 1000)}k`);

interface LineRow {
  readonly line_code: string;
  readonly product: string;
  readonly shift_scheme: number;
  readonly location: string;
}
interface Planning {
  readonly lines: readonly { readonly line_code: string; readonly target: number; readonly work_days: number }[];
}
interface Report {
  readonly line: string;
  readonly tanggal: string;
  readonly shift: number | null;
  readonly shiftLabel: string | null;
  readonly actual: number | null;
  readonly plan: number | null;
  readonly categories: readonly (number | null)[];
  readonly availability_loss: number | null;
  readonly performance_loss: number | null;
  readonly quality_loss: number | null;
  readonly items: readonly (readonly [string | null, string | null, string | null, number | null])[];
}
interface StopEvent {
  readonly line: string;
  readonly date: string;
  readonly shift: string | null;
  readonly kategori: string | null;
  readonly masalah: string | null;
  readonly minute: number | null;
}

interface MRow {
  readonly line: string;
  readonly site: string;
  readonly product: string;
  readonly scheme: number;
  readonly monthly: number | null;
  readonly days: number;
  readonly dailyTarget: number | null;
  readonly actual: number | null;
  readonly toDate: number | null;
  readonly gap: number | null;
  readonly daily: ReadonlyMap<number, LineDayMetrics>;
}

// Urutan kategori di reports.categories: Machine, Man, Material, Method, Other.
const LOSS_CATS: [string, number][] = [
  ['Man', 1],
  ['Method', 3],
  ['Material', 2],
  ['Machine', 0],
  ['Other', 4],
];

function useShadow(): [React.RefObject<HTMLDivElement | null>, ShadowRoot | null] {
  const ref = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sr = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
    setRoot(sr);
  }, []);
  return [ref, root];
}

export function Monitoring({ site }: { readonly site: string }) {
  const [hostRef, shadow] = useShadow();
  const { me } = useAuth();
  const { kpi, raw } = useConfig();
  const today = me?.today ?? '';
  const month = today.slice(0, 7);
  const monthEnd = lastOfMonth(month);
  const cutoffDay = Number(today.slice(8));
  const nDays = Number(monthEnd.slice(8));
  const mon = (MON[Number(month.slice(5)) - 1] ?? '').slice(0, 3);
  const defaultTab =
    String((raw.get('config.display')?.value as { investigation?: string } | undefined)?.investigation ?? 'loss') === 'output'
      ? 'output'
      : 'loss';

  const [state, setState] = useState({
    location: site,
    status: '',
    sort: 'source',
    order: 1,
    line: '',
    day: cutoffDay,
    start: Math.max(1, Math.min(nDays - 6, cutoffDay - 3)),
    tab: defaultTab as 'loss' | 'output',
    shift: 0,
    meeting: false,
    lossCategory: '',
    lossMetric: 'minutes' as 'minutes' | 'count',
  });
  useEffect(() => setState((s) => ({ ...s, location: site, line: '', shift: 0, lossCategory: '' })), [site]);
  const set = (p: Partial<typeof state>): void => setState((s) => ({ ...s, ...p }));

  const lines = useApi<LineRow[]>('/api/v3/lines');
  const planning = useApi<Planning>(`/api/v3/planning?year=${month.slice(0, 4)}&month=${Number(month.slice(5))}`);
  const metrics = useApi<{ rows: LineDayMetrics[] }>(
    `/api/v3/reporting/line-metrics?start=${month}-01&end=${today}&location=internal&perDay=1`,
  );
  const calendar = useApi<{ holidays: string[] }>(
    `/api/v3/executive/calendar?tempat=internal&year=${month.slice(0, 4)}&month=${Number(month.slice(5))}`,
  );
  const selDate = `${month}-${pad(state.day)}`;
  const reports = useApi<Report[]>(
    state.line ? `/api/v3/reporting/reports?start=${selDate}&end=${selDate}&line=${encodeURIComponent(state.line)}` : null,
  );
  const events = useApi<{ events: StopEvent[] }>(
    state.line ? `/api/v3/reporting/stoptime?start=${selDate}&end=${selDate}&line=${encodeURIComponent(state.line)}` : null,
  );
  const calRef = useRef<HTMLDialogElement>(null);
  const [calSite, setCalSite] = useState('internal');

  const holidays = new Set(calendar.data?.holidays ?? []);
  const isWork = (day: number): boolean => !holidays.has(`${month}-${pad(day)}`);
  const workDays = dayList(`${month}-01`, monthEnd).filter((d) => !holidays.has(d)).length;
  const elapsedWork = (n: number): number => dayList(`${month}-01`, `${month}-${pad(n)}`).filter((d) => !holidays.has(d)).length;

  const targetBy = new Map((planning.data?.lines ?? []).map((t) => [t.line_code, t]));
  const data: MRow[] = (lines.data ?? [])
    .filter((l) => l.location === 'internal')
    .map((l) => {
      const daily = new Map(
        (metrics.data?.rows ?? []).filter((r) => r.line === l.line_code && r.date).map((r) => [Number(r.date?.slice(8)), r]),
      );
      const t = targetBy.get(l.line_code);
      const monthly = t ? t.target : null;
      const days = t ? t.work_days : workDays;
      const dailyTarget = monthly !== null && days ? monthly / days : null;
      const actualList = [...daily.values()].filter((r) => r.reports > 0);
      const actual = actualList.length ? actualList.reduce((a, r) => a + r.actual, 0) : null;
      const toDate = dailyTarget !== null ? dailyTarget * elapsedWork(cutoffDay) : null;
      return {
        line: l.line_code,
        site: l.location,
        product: l.product,
        scheme: l.shift_scheme,
        monthly,
        days,
        dailyTarget,
        actual,
        toDate,
        gap: actual !== null && toDate !== null ? actual - toDate : null,
        daily,
      };
    });
  const planned = (r: MRow): boolean => r.monthly !== null && (r.toDate ?? 0) > 0;
  const gapFor = (r: MRow): number | null => (planned(r) ? r.gap : null);
  const band = (a: number | null, t: number | null): string => achievementBand(ratio(a, t), kpi);
  const dailyOutput = (r: MRow, day: number): number | null => {
    const m = r.daily.get(day);
    return day <= cutoffDay && m && m.reports > 0 ? m.actual : null;
  };
  const dayTarget = (r: MRow, day: number): number | null => {
    if (!isWork(day)) return 0;
    if (r.dailyTarget !== null) return r.dailyTarget;
    const p = r.daily.get(day)?.plan;
    return p && p > 0 ? p : null;
  };
  const dayClass = (r: MRow, day: number): string => {
    if (!isWork(day)) return 'off';
    const q = dailyOutput(r, day);
    if (q === null) return 'missing';
    return band(q, dayTarget(r, day));
  };

  const locationRows = data.filter((r) => state.location === 'all' || r.site === state.location);
  let rows = locationRows.filter((r) => {
    if (state.status === 'unplanned') return r.monthly === null;
    if (state.status === '') return true;
    return band(r.actual, planned(r) ? r.toDate : null) === state.status;
  });
  if (state.sort !== 'source') {
    rows = [...rows].sort((a, b) => {
      if (state.sort === 'line') return state.order * a.line.localeCompare(b.line, 'id', { numeric: true });
      const x = gapFor(a);
      const y = gapFor(b);
      if (x === null) return y === null ? 0 : 1;
      if (y === null) return -1;
      return state.order * (x - y);
    });
  }
  const selected = rows.find((r) => r.line === state.line) ?? null;

  const summarize = (list: readonly MRow[]) => {
    const withPlan = list.filter(planned);
    const s = (f: (r: MRow) => number | null): number | null => {
      const v = withPlan.map(f).filter((x): x is number => x !== null);
      return v.length ? v.reduce((a, b) => a + b, 0) : null;
    };
    const actual = s((r) => r.actual);
    const plan = s((r) => r.toDate);
    const measured = withPlan.filter((r) => gapFor(r) !== null);
    return {
      actual,
      plan,
      gap: actual !== null && plan !== null ? actual - plan : null,
      behind: measured.filter((r) => (gapFor(r) ?? 0) < 0).length,
      measured: measured.length,
    };
  };
  const total = summarize(data);
  const monthlySum = data.map((r) => r.monthly).filter((x): x is number => x !== null);
  const totalBand = band(total.actual, total.plan);
  const progress = total.plan && total.actual !== null ? Math.max(0, Math.min(100, (total.actual / total.plan) * 100)) : null;
  const cards: [string, string, string, string, string, string][] = [
    [
      'target',
      'Target Bulanan',
      fmt(monthlySum.length ? monthlySum.reduce((a, b) => a + b, 0) : null),
      'pcs',
      '',
      `Target untuk seluruh bulan ${MON[Number(month.slice(5)) - 1] ?? ''}`,
    ],
    ['box', 'Actual Line Bertarget', fmt(total.actual), 'pcs', '', 'Output dari line yang memiliki target berjalan'],
    ['calendar', `Target s/d ${cutoffDay} ${mon}`, fmt(total.plan), 'pcs', '', 'Target sampai tanggal batas data'],
    ['gap', 'Gap', signed(total.gap), 'pcs', grade(total.gap), 'Actual dikurangi target berjalan'],
    ['trophy', 'Achievement', pct(total.actual, total.plan), '', totalBand, 'Actual line bertarget dibagi target berjalan'],
  ];

  const ds = Array.from({ length: Math.min(7, nDays + 1 - state.start) }, (_, i) => state.start + i);
  const combined = state.location === 'all';
  const header = ['Line', 'Series', 'Shift', 'Hari kerja', 'Target bln', 'Target/hari', 'Actual', 'Target s/d', 'Gap', 'Achv.'];

  useEffect(() => {
    document.body.classList.toggle('monitoring-meeting', state.meeting);
    return () => document.body.classList.remove('monitoring-meeting');
  }, [state.meeting]);
  useEffect(() => {
    if (!state.meeting) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !calRef.current?.open) set({ meeting: false });
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [state.meeting]);

  const pickLine = (line: string, day?: number): void => {
    set({ line, tab: defaultTab as 'loss' | 'output', shift: 0, lossCategory: '', ...(day ? { day } : {}) });
    const target = shadow?.getElementById('investigasi');
    if (target && (innerWidth < 800 || target.getBoundingClientRect().top > innerHeight - 120)) target.scrollIntoView({ block: 'start' });
  };

  const siteTotals = SITES.map((s) => ({ site: s, ...summarize(data.filter((r) => r.site === s)) }));
  const attainment = (a: number | null, p: number | null): number => (p && a !== null ? Math.max(0, a / p) : 0);
  const maxAtt = Math.max(1.25, ...siteTotals.map((t) => attainment(t.actual, t.plan)));
  const scale = (v: number): string => `${((v / maxAtt) * 100).toFixed(3)}%`;
  const kcell = (label: string, value: ReactNode, style = ''): ReactNode => (
    <td role="cell" className={style}>
      <span className="site-kpi-label" aria-hidden="true">
        {label}
      </span>
      {value}
    </td>
  );
  const output = (v: number | null): ReactNode =>
    v === null ? (
      '—'
    ) : (
      <>
        {fmt(v)} <small>pcs</small>
      </>
    );

  const content = (
    <>
      <style>{templateCss}</style>
      <div className="wrap">
        <div className="top">
          <div className="cutoff">
            Data sampai <b id="cutoff">{`${cutoffDay} ${MON[Number(month.slice(5)) - 1] ?? ''} ${month.slice(0, 4)}`}</b>
          </div>
          <div className="actions">
            <span className="snapshot">Data i-Reporter</span>
            <button
              type="button"
              className="btn primary"
              id="meeting"
              aria-pressed={state.meeting}
              onClick={() => set({ meeting: !state.meeting })}
            >
              <span>
                <Icon name="screen" size={16} />
              </span>
              <span>{state.meeting ? 'Keluar Mode Meeting' : 'Mode Meeting'}</span>
            </button>
          </div>
        </div>
        <section className="scope-summary" aria-labelledby="summary-heading">
          <h2 className="summary-heading" id="summary-heading">
            Ringkasan Semua Lokasi
          </h2>
          <div className="kpis" id="kpis">
            {cards.map(([name, label, value, unit, color, hint]) => (
              <article className="kpi" data-metric={name} title={hint} key={name}>
                <div className="kpi-label">{label}</div>
                <div className="metric-inline">
                  <strong className={`kpi-value ${color}`}>{value}</strong>
                  {unit && value !== '—' ? (
                    <>
                      {' '}
                      <small className="kpi-unit">{unit}</small>
                    </>
                  ) : null}
                  {name === 'trophy' && progress !== null ? (
                    <>
                      {' '}
                      <AchievementCaption band={totalBand as 'ach-red'} label={achievementLabel(ratio(total.actual, total.plan), kpi)} />
                    </>
                  ) : null}
                </div>
                {name === 'trophy' && progress !== null ? (
                  <progress
                    className={`kpi-meter ${color}`}
                    value={progress}
                    max={100}
                    aria-label="Pencapaian terhadap target berjalan"
                  ></progress>
                ) : null}
              </article>
            ))}
          </div>
        </section>
        <section className="panel site-kpi-summary" aria-labelledby="site-kpi-title">
          <header className="module-head">
            <h2 id="site-kpi-title">KPI per Lokasi</h2>
            <small className="site-compare-key">Garis target 100%</small>
          </header>
          <div className="site-kpi-scroll" tabIndex={0} role="region" aria-labelledby="site-kpi-title">
            <table className="site-kpi-table" role="table">
              <thead role="rowgroup">
                <tr role="row">
                  {['Lokasi', 'Output Plan', 'Output Actual', 'Gap', 'Bekidoritsu', 'Line di Bawah Target'].map((h) => (
                    <th scope="col" role="columnheader" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody id="site-kpi-rows" role="rowgroup">
                {siteTotals.map(({ site: s, actual, plan, gap, behind, measured }) => {
                  const text = pct(actual, plan);
                  return (
                    <tr role="row" key={s}>
                      <th scope="row" role="rowheader">
                        {siteName(s)}
                        {s !== 'internal' ? <small> · On Hold</small> : null}
                      </th>
                      {kcell('Output Plan', output(plan))}
                      {kcell('Output Actual', output(actual))}
                      {kcell(
                        'Gap',
                        <>
                          {signed(gap)}
                          {gap !== null ? <small> pcs</small> : null}
                        </>,
                      )}
                      {kcell(
                        'Bekidoritsu',
                        text === '—' ? (
                          <strong>—</strong>
                        ) : (
                          <span className={`site-compare ${band(actual, plan)}`} title={achievementLabel(ratio(actual, plan), kpi)}>
                            <span
                              className="site-compare-track"
                              aria-hidden="true"
                              style={{
                                ['--target-mark' as string]: scale(1),
                                ['--actual-progress' as string]: scale(attainment(actual, plan)),
                              }}
                            >
                              <i className="site-compare-fill"></i>
                            </span>
                            <strong>{text}</strong>
                          </span>
                        ),
                      )}
                      {kcell(
                        'Line di Bawah Target',
                        <strong>
                          {measured ? (
                            <>
                              {fmt(behind)} / {fmt(measured)} <small>line</small>
                            </>
                          ) : (
                            '—'
                          )}
                        </strong>,
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel" id="matrix-panel" aria-labelledby="matrix-title">
          <header className="module-head">
            <div>
              <h2 id="matrix-title">Target vs Actual</h2>
              <p>Pilih tanggal untuk membuka detail shift dan penyebab.</p>
            </div>
            <div className="matrix-tools">
              <label htmlFor="status">Status</label>
              <select id="status" value={state.status} onChange={(e) => set({ status: e.target.value })}>
                <option value="">Semua status</option>
                <option value="ach-red">Di bawah target</option>
                <option value="ach-yellow">Mendekati target</option>
                <option value="ach-green">Tercapai</option>
                <option value="unplanned">Tanpa target</option>
              </select>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setCalSite(selected?.site ?? 'internal');
                  calRef.current?.showModal();
                }}
              >
                <span>
                  <Icon name="calendar" size={16} />
                </span>{' '}
                Kalender
              </button>
            </div>
          </header>
          <div className="matrix-locations" id="location-tabs" role="tablist" aria-label="Lokasi Target vs Actual">
            {(['all', ...SITES] as string[]).map((id) => (
              <button
                key={id}
                type="button"
                className="location-tab"
                id={`location-tab-${id}`}
                role="tab"
                data-location={id}
                aria-controls="location-table"
                aria-selected={state.location === id}
                tabIndex={state.location === id ? 0 : -1}
                onClick={() => set({ location: id, line: '', shift: 0 })}
              >
                {id === 'all' ? 'Semua Lokasi' : siteName(id)}
              </button>
            ))}
          </div>
          <div id="location-table" role="tabpanel" aria-labelledby={`location-tab-${state.location}`}>
            <div
              className="matrix-scroll"
              id="matrix-scroll"
              tabIndex={0}
              aria-label="Tabel output per line dan tanggal"
              {...(combined ? { 'data-combined': '' } : {})}
            >
              <table className="matrix">
                <colgroup id="matrix-columns">
                  {[combined ? 100 : 85, 66, 47, 46, 68, 68, 68, 88, 96, 68].map((w, i) => (
                    <col key={i} style={{ width: `${w}px` }} />
                  ))}
                  {ds.map((d) => (
                    <col key={`d${d}`} />
                  ))}
                </colgroup>
                <thead id="matrix-head">
                  <tr>
                    {header.map((t, i) => {
                      const key = i === 0 ? 'line' : i === 8 ? 'gap' : null;
                      return (
                        <th
                          scope="col"
                          key={t}
                          {...(key ? { 'aria-sort': state.sort === key ? (state.order === 1 ? 'ascending' : 'descending') : 'none' } : {})}
                        >
                          {key ? (
                            <button
                              type="button"
                              className="sort-pick"
                              data-sort={key}
                              onClick={() => set({ order: state.sort === key ? -state.order : 1, sort: key })}
                            >
                              {t}{' '}
                              <span aria-hidden="true">
                                <Icon name={state.sort === key ? (state.order === 1 ? 'up' : 'down') : 'sort'} size={13} />
                              </span>
                            </button>
                          ) : (
                            t
                          )}
                        </th>
                      );
                    })}
                    {ds.map((d, i) => (
                      <th
                        scope="col"
                        key={d}
                        className={`day-head ${i === 0 ? 'group-divider ' : ''}${state.line && d === state.day ? 'match-day' : ''}`}
                      >
                        {pad(d)} <small>{mon}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody id="matrix-body">
                  {rows.length ? (
                    rows.map((r) => {
                      const active = r.line === state.line;
                      return (
                        <tr id={`row-${r.line}`} key={r.line} className={active ? 'selected' : ''}>
                          <td>
                            <button
                              type="button"
                              className="line-pick"
                              data-line={r.line}
                              aria-pressed={active}
                              onClick={() => pickLine(r.line)}
                            >
                              {r.line}
                              {combined ? <small className="line-site">{siteName(r.site)}</small> : null}
                            </button>
                          </td>
                          <td>{r.product || '—'}</td>
                          <td title={`${r.scheme} shift`}>{r.scheme} sh</td>
                          <td>{fmt(r.days)}</td>
                          <td>{fmt(r.monthly)}</td>
                          <td>{fmt(r.dailyTarget)}</td>
                          <td>{fmt(r.actual)}</td>
                          <td>{r.monthly === null ? '—' : fmt(r.toDate)}</td>
                          <td>
                            <span className="gap-pill">{signed(gapFor(r))}</span>
                          </td>
                          <td>
                            <strong className={band(r.actual, r.toDate)} title={achievementLabel(ratio(r.actual, r.toDate), kpi)}>
                              {pct(r.actual, planned(r) ? r.toDate : null)}
                            </strong>
                          </td>
                          {ds.map((d, i) => {
                            const q = dailyOutput(r, d);
                            const cls = dayClass(r, d);
                            const chosen = active && d === state.day;
                            return (
                              <td key={d} className={i === 0 ? 'group-divider' : ''}>
                                <button
                                  type="button"
                                  className={`cell-pick ${cls}${chosen ? ' chosen' : ''}`}
                                  data-line={r.line}
                                  data-day={d}
                                  aria-pressed={chosen}
                                  aria-label={`${r.line}, ${d} ${MON[Number(month.slice(5)) - 1] ?? ''}, ${q === null ? 'belum ada output tercatat' : `${fmt(q)} pcs`}`}
                                  onClick={() => pickLine(r.line, d)}
                                >
                                  {fmt(q)}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={10 + ds.length} className="empty">
                        {state.location !== 'all' && state.location !== 'internal'
                          ? 'Lokasi ini On Hold — data subcont belum tersambung.'
                          : lines.loading || metrics.loading
                            ? 'Memuat…'
                            : 'Tidak ada line yang cocok dengan filter.'}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot id="matrix-totals">
                  <tr>
                    <th scope="row">Total Output</th>
                    <td colSpan={9}></td>
                    {ds.map((d, i) => {
                      const v = rows.map((r) => dailyOutput(r, d)).filter((x): x is number => x !== null);
                      return (
                        <td key={d} className={`matrix-total-day${i === 0 ? ' group-divider' : ''}`}>
                          {fmt(v.length ? v.reduce((a, b) => a + b, 0) : null)}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="matrix-foot">
              <div className="legend">
                <span id="rows-count" aria-live="polite">
                  {rows.length} line
                </span>
                <span id="matrix-achievement-key">
                  <AchievementLegend t={kpi} />
                </span>
                <span>
                  <i className="off"></i>Libur
                </span>
              </div>
              <div className="date-nav">
                <button
                  type="button"
                  className="btn icon-btn"
                  id="prev"
                  aria-label="Tanggal sebelumnya"
                  disabled={state.start === 1}
                  onClick={() => set({ start: Math.max(1, state.start - 7) })}
                >
                  <Icon name="back" size={16} />
                </button>
                <output id="range">
                  {ds[0]}–{ds.at(-1)} {mon}
                </output>
                <button
                  type="button"
                  className="btn icon-btn"
                  id="next"
                  aria-label="Tanggal berikutnya"
                  disabled={(ds.at(-1) ?? 0) >= nDays}
                  onClick={() => set({ start: Math.min(nDays - 6, state.start + 7) })}
                >
                  <Icon name="next" size={16} />
                </button>
              </div>
            </div>
          </div>
        </section>
        <Detail
          row={selected}
          state={state}
          set={set}
          month={month}
          cutoffDay={cutoffDay}
          nDays={nDays}
          reports={reports.data ?? []}
          events={events.data?.events ?? []}
          dailyOutput={dailyOutput}
          dayTarget={dayTarget}
          band={band}
          isWork={isWork}
          loading={reports.loading}
        />
        <p className="footer">Sumber: laporan i-Reporter (ConMas) · target line dari Settings → Target Produksi.</p>
      </div>
      <dialog className="dialog" id="calendar" aria-labelledby="calendar-title" ref={calRef}>
        <div className="dialog-head">
          <h2 id="calendar-title">
            Kalender Kerja · {MON[Number(month.slice(5)) - 1]} {month.slice(0, 4)}
          </h2>
          <form method="dialog">
            <button className="btn icon-btn" aria-label="Tutup kalender">
              <Icon name="close" size={16} />
            </button>
          </form>
        </div>
        <div className="dialog-inner">
          <label className="calendar-site">
            Lokasi{' '}
            <select id="calendar-location" value={calSite} onChange={(e) => setCalSite(e.target.value)} disabled>
              <option value="internal">{siteName('internal')}</option>
            </select>
          </label>
          <div className="calendar" id="calendar-body">
            <table>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: nDays }, (_, i) => i + 1).map((d) => (
                  <tr key={d}>
                    <th scope="row">
                      {d} {MON[Number(month.slice(5)) - 1]}
                    </th>
                    <td className={isWork(d) ? 'on' : 'off'}>{isWork(d) ? 'Masuk' : 'Libur'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="notice">Kalender kerja lokasi dari Settings → Shift &amp; Kalender (Executive → Kalender Kerja).</p>
        </div>
      </dialog>
    </>
  );

  return (
    <div className="page monitoring-page">
      <div id="monitoring-mount">
        <Host ref={hostRef} {...{ site: state.location }} {...(state.meeting ? { meeting: '' } : {})}>
          {null}
        </Host>
        {shadow ? createPortal(content, shadow) : null}
      </div>
    </div>
  );
}

interface DetailProps {
  readonly row: MRow | null;
  readonly state: {
    line: string;
    day: number;
    tab: 'loss' | 'output';
    shift: number;
    lossCategory: string;
    lossMetric: 'minutes' | 'count';
  };
  readonly set: (p: Partial<DetailProps['state']>) => void;
  readonly month: string;
  readonly cutoffDay: number;
  readonly nDays: number;
  readonly reports: readonly Report[];
  readonly events: readonly StopEvent[];
  readonly dailyOutput: (r: MRow, d: number) => number | null;
  readonly dayTarget: (r: MRow, d: number) => number | null;
  readonly band: (a: number | null, t: number | null) => string;
  readonly isWork: (d: number) => boolean;
  readonly loading: boolean;
}

function Detail({ row, state, set, month, cutoffDay, nDays, reports, events, dailyOutput, dayTarget, band, isWork, loading }: DetailProps) {
  const monthName = MON[Number(month.slice(5)) - 1] ?? '';
  const tabs = (
    <div className="tabbar" aria-label="Tampilan investigasi">
      <button type="button" className="tab" data-tab="loss" aria-pressed={state.tab === 'loss'} onClick={() => set({ tab: 'loss' })}>
        Breakdown &amp; Penyebab
      </button>
      <button type="button" className="tab" data-tab="output" aria-pressed={state.tab === 'output'} onClick={() => set({ tab: 'output' })}>
        Output &amp; Shift
      </button>
    </div>
  );
  if (!row) {
    return (
      <section className="panel detail" id="investigasi" aria-label="Detail investigasi">
        <header className="section-title">
          <div>
            <h2 id="detail-title">Detail Investigasi</h2>
            <div className="detail-context" id="detail-context"></div>
          </div>
          <div className="detail-actions">{tabs}</div>
        </header>
        <div className="detail-body" id="detail-body">
          <div className="detail-table empty">Pilih line untuk membuka detail investigasi.</div>
        </div>
      </section>
    );
  }
  const day = state.day;
  const sorted = [...reports].sort((a, b) => (a.shift ?? 0) - (b.shift ?? 0));
  const selected = sorted.filter((r) => !state.shift || r.shift === state.shift);
  const shifts = [...new Set(sorted.map((r) => r.shift ?? 0))];
  const actual = dailyOutput(row, day);
  const dayLabel = `${day} ${monthName} ${month.slice(0, 4)}`;
  const sumOf = (list: readonly Report[], f: (r: Report) => number | null): number | null => {
    const v = list.map(f).filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  const max = Math.max(
    1,
    row.dailyTarget ?? 0,
    ...Array.from({ length: nDays }, (_, i) => Math.max(dayTarget(row, i + 1) ?? 0, dailyOutput(row, i + 1) ?? 0)),
  );
  const bars = Array.from({ length: nDays }, (_, i) => i + 1).map((d) => {
    const q = dailyOutput(row, d);
    const future = d > cutoffDay;
    const t = isWork(d) ? dayTarget(row, d) : null;
    const b = band(q, t);
    const desc = `${d} ${monthName} · ${q === null ? (future ? 'Data belum tersedia' : 'Output belum tercatat') : `${fmt(q)} pcs`}${t === null ? '' : ` · Target ${fmt(t)} pcs · ${pct(q, t)}`}`;
    return (
      <button
        key={d}
        type="button"
        className={`bar${d === day ? ' chosen' : ''}${b ? ` ${b}` : ''}${future ? ' future' : ''}`}
        data-chart-day={d}
        aria-pressed={d === day}
        title={desc}
        aria-label={desc}
        onClick={() => set({ day: d, shift: 0, lossCategory: '' })}
      >
        <span className="bar-plot">
          {t === null ? null : <span className="bar-target" style={{ bottom: `${(t / max) * 84}%` }}></span>}
          {q && q > 0 ? (
            <span className="bar-fill" style={{ height: `${(q / max) * 84}%` }}>
              <span className={`bar-value${q >= 10000 ? ' long' : ''}`}>
                <span className="bar-value-compact">{compactQty(q)}</span>
                <span className="bar-value-exact">{fmt(q)}</span>
              </span>
            </span>
          ) : null}
        </span>
        <span>{d}</span>
      </button>
    );
  });
  const chart = (
    <>
      <div className="subhead">
        <h3>Output Harian</h3>
        <span className="muted">
          {day} {monthName.slice(0, 3)} ·{' '}
          {actual === null ? (
            <span className="muted">Output belum tercatat</span>
          ) : (
            <strong className="line-chart-actual">
              {fmt(actual)} <small>pcs</small>
            </strong>
          )}
        </span>
      </div>
      <div className="chart" aria-label={`Grafik output harian ${monthName}`}>
        {bars}
      </div>
      <div className="chart-legend">
        <span>
          <i></i>Actual
        </span>
        <span>
          <i className="target-marker"></i>
          {row.dailyTarget !== null ? 'Plan harian (target line)' : 'Plan harian (i-Reporter)'}
        </span>
      </div>
    </>
  );
  const shiftPanel = (
    <>
      <div className="subhead">
        <h3>Output per Shift</h3>
        {state.shift ? (
          <button type="button" className="btn" data-shift="0" onClick={() => set({ shift: 0 })}>
            Semua shift
          </button>
        ) : null}
      </div>
      {shifts.length ? (
        <>
          <div className="shifts">
            {shifts.map((n) => {
              const list = sorted.filter((r) => (r.shift ?? 0) === n);
              const value = sumOf(list, (r) => r.actual);
              const plan = sumOf(list, (r) => r.plan);
              const b = band(value, plan);
              return (
                <button
                  key={n}
                  type="button"
                  className="shift"
                  data-shift={n}
                  aria-pressed={state.shift === n}
                  onClick={() => set({ shift: state.shift === n ? 0 : n })}
                >
                  {`Shift ${n}`}
                  <strong className={b}>
                    {fmt(value)} <small>pcs</small>
                  </strong>
                  {b ? <small className={b}>{pct(value, plan)}</small> : null}
                </button>
              );
            })}
          </div>
          <p>
            Total {fmt(actual)} pcs · {sorted.length} laporan shift
          </p>
        </>
      ) : (
        <p>{loading ? 'Memuat…' : day > cutoffDay ? 'Tanggal ini melewati batas data.' : 'Belum ada laporan shift di tanggal ini.'}</p>
      )}
    </>
  );
  const evs = events.filter((e) => !state.shift || Number(/Shift\s*(\d)/.exec(e.shift ?? '')?.[1] ?? 0) === state.shift);
  const totals = LOSS_CATS.map(([name, i]) => ({
    name,
    minutes: sumOf(selected, (r) => r.categories[i] ?? null),
    count: selected.length ? evs.filter((e) => e.kategori === name).length : null,
  }));
  const topCount = Math.max(0, ...totals.map((t) => t.count ?? 0));
  const leaders = topCount ? totals.filter((t) => t.count === topCount).map((t) => t.name) : [];
  const metric = evs.length && state.lossMetric === 'count' ? 'count' : 'minutes';
  const lmax = Math.max(1, ...totals.map((t) => (metric === 'count' ? (t.count ?? 0) : (t.minutes ?? 0))));
  const duration = (v: number | null, small = false): ReactNode =>
    v === null ? (
      '—'
    ) : small ? (
      <>
        {fmt(v)} <small>menit</small>
      </>
    ) : (
      `${fmt(v)} menit`
    );
  const chosen = state.lossCategory;
  const matching = evs.filter((e) => !chosen || e.kategori === chosen);
  const loss = (
    <section className="subpanel detail-table">
      <div className="subhead">
        <h3>Breakdown &amp; Penyebab</h3>
        <div className="detail-actions">
          <span className="badge">{state.shift ? `Shift ${state.shift}` : 'Semua shift'}</span>
          <a className="btn" href={`#stoptime-${row.site}`}>
            Lihat Stoptime
          </a>
        </div>
      </div>
      <div className="loss-summary">
        {(
          [
            ['Availability Loss', 'availability_loss'],
            ['Quality Loss', 'quality_loss'],
            ['Performance Loss', 'performance_loss'],
          ] as const
        ).map(([label, key]) => (
          <div key={key}>
            {label}
            <strong className="metric-inline">
              {duration(
                sumOf(selected, (r) => r[key]),
                true,
              )}
            </strong>
          </div>
        ))}
        <div className="loss-top">
          Kategori terbanyak
          <strong>
            {leaders.join(', ') || '—'}
            {topCount ? (
              <small>
                {' '}
                {fmt(topCount)}×{leaders.length > 1 ? ' masing-masing' : ''}
              </small>
            ) : null}
          </strong>
        </div>
      </div>
      <div className="loss-layout">
        <div className="loss-panel">
          <div className="subhead">
            <h4>Kategori Penyebab</h4>
            <div className="loss-measures" aria-label="Metrik grafik kategori">
              {(
                [
                  ['count', 'Kejadian'],
                  ['minutes', 'Durasi'],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  className="btn"
                  type="button"
                  data-loss-metric={v}
                  aria-pressed={metric === v}
                  disabled={v === 'count' && !evs.length}
                  onClick={() => set({ lossMetric: v })}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Kategori</th>
                <th className="num">Kejadian</th>
                <th className="num">Durasi</th>
              </tr>
            </thead>
            <tbody>
              {totals.map(({ name, minutes, count }) => {
                const v = metric === 'count' ? (count ?? 0) : (minutes ?? 0);
                return (
                  <tr key={name}>
                    <td>
                      <button
                        type="button"
                        className="loss-category"
                        data-loss-category={name}
                        aria-pressed={chosen === name}
                        onClick={() => set({ lossCategory: chosen === name ? '' : name })}
                      >
                        {name}
                        <span className="loss-track" aria-hidden="true">
                          <i style={{ width: `${Math.max(0, (v / lmax) * 100)}%` }}></i>
                        </span>
                      </button>
                    </td>
                    <td className="num">{count === null ? '—' : `${fmt(count)}×`}</td>
                    <td className="num">{duration(minutes)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="loss-panel loss-events">
          <div className="subhead">
            <h4>Rincian Remark{chosen ? ` · ${chosen}` : ''}</h4>
            {chosen ? (
              <button className="btn" type="button" data-loss-category="" onClick={() => set({ lossCategory: '' })}>
                Semua kategori
              </button>
            ) : null}
          </div>
          {matching.length ? (
            <div className="hscroll">
              <table>
                <thead>
                  <tr>
                    <th>Shift</th>
                    {!chosen ? <th>Kategori</th> : null}
                    <th>Masalah</th>
                    <th className="num">Durasi</th>
                  </tr>
                </thead>
                <tbody>
                  {matching.map((e, i) => (
                    <tr key={i}>
                      <td>{e.shift ? e.shift.replace(/\s*\(.*\)/, '') : '—'}</td>
                      {!chosen ? <td>{e.kategori ?? '—'}</td> : null}
                      <td>{e.masalah ?? '—'}</td>
                      <td className="num">{duration(e.minute)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>{selected.length ? 'Tidak ada durasi tercatat untuk pilihan ini.' : 'Belum ada laporan shift pada tanggal ini.'}</p>
          )}
        </div>
      </div>
    </section>
  );
  const totalShift = sumOf(sorted, (r) => r.actual);
  const difference = totalShift !== null && actual !== null && Math.abs(totalShift - actual) > 0.001;
  const outputPanel = (
    <section className="subpanel detail-table">
      <div className="subhead">
        <h3>Produk dalam Laporan {state.shift ? `Shift ${state.shift}` : 'Shift'}</h3>
        <span className="badge">{dayLabel}</span>
      </div>
      {selected.length ? (
        <>
          <div className="hscroll">
            <table>
              <thead>
                <tr>
                  <th>Shift</th>
                  <th>Produk</th>
                  <th>CL No.</th>
                  <th>MO No.</th>
                  <th>QTY slot</th>
                  <th>Actual laporan</th>
                </tr>
              </thead>
              <tbody>
                {selected.flatMap((r, ri) =>
                  r.items.length
                    ? r.items.map(([name, cl, mo, qty], i) => (
                        <tr key={`${ri}-${i}`}>
                          <td>Shift {r.shift ?? '—'}</td>
                          <td>
                            <b>{name ?? '—'}</b>
                          </td>
                          <td>{cl ?? '—'}</td>
                          <td>{mo ?? '—'}</td>
                          <td>{fmt(qty)}</td>
                          <td>{i === 0 ? fmt(r.actual) : '—'}</td>
                        </tr>
                      ))
                    : [
                        <tr key={`${ri}-e`}>
                          <td>Shift {r.shift ?? '—'}</td>
                          <td colSpan={4}>Detail produk kosong</td>
                          <td>{fmt(r.actual)}</td>
                        </tr>,
                      ],
                )}
              </tbody>
            </table>
          </div>
          <p>Actual ditampilkan sekali per laporan shift. QTY slot adalah nilai masing-masing slot produk di laporan.</p>
        </>
      ) : (
        <p>Tidak ada detail produk untuk tanggal ini.</p>
      )}
      {difference ? (
        <div className="notice">
          Total laporan shift {fmt(totalShift)} pcs, matriks {fmt(actual)} pcs. Perlu cek cakupan laporan.
        </div>
      ) : null}
    </section>
  );
  return (
    <section className="panel detail" id="investigasi" aria-label="Detail investigasi">
      <header className="section-title">
        <div>
          <h2 id="detail-title">
            Detail Line <span className="context-pill">{row.line}</span>
          </h2>
          <div className="detail-context" id="detail-context">
            <span>{siteName(row.site)}</span>
            <span>·</span>
            <span>{row.product || 'Series kosong'}</span>
            <span>·</span>
            <strong>{dayLabel}</strong>
            <span className="badge">{isWork(day) ? 'Masuk' : 'Libur'}</span>
          </div>
        </div>
        <div className="detail-actions">
          <button
            type="button"
            className="btn"
            id="back-matrix"
            onClick={(e) => {
              const root = (e.currentTarget.getRootNode() as ShadowRoot).getElementById('matrix-panel');
              root?.scrollIntoView({ block: 'start' });
            }}
          >
            Kembali ke tabel
          </button>
          {tabs}
        </div>
      </header>
      <div className="detail-body" id="detail-body">
        <section className="subpanel">{chart}</section>
        <section className="subpanel">{shiftPanel}</section>
        {state.tab === 'loss' ? loss : outputPanel}
      </div>
    </section>
  );
}
