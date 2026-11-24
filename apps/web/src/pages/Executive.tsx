import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import { AchievementCaption, AchievementLegend, achievementBand, achievementLabel } from '../lib/achievement';
import { useAuth } from '../lib/auth';
import { fd, fmt, MON, P, pct } from '../lib/format';
import { Icon } from '../lib/icons';
import { SITE_INFO, type Site } from '../lib/sites';
import { WorkCalendar } from './WorkCalendar';

// Port executiveView() mockup → data dari GET /api/v3/executive/month.
interface ApiLocation {
  readonly tempat: Site;
  readonly status: 'ok' | 'on_hold' | 'unavailable';
  readonly target: number | null;
  readonly targetVersion: number | null;
  readonly workingDays: number;
  readonly actual: number | null;
  readonly achievement: { readonly targetHariIni: number } | null;
  readonly daily: { readonly date: string; readonly actual: number } | null;
}
interface ApiMonth {
  readonly locations: readonly ApiLocation[];
}

interface Row {
  readonly key: Site;
  readonly name: string;
  readonly color: string;
  readonly status: ApiLocation['status'];
  readonly days: number;
  readonly monthly: number | null;
  readonly running: number | null;
  readonly dailyActual: number | null;
  readonly actual: number | null;
  readonly runningGap: number | null;
  readonly monthlyGap: number | null;
  readonly runningPct: number | null;
  readonly monthlyPct: number | null;
  readonly targetVersion: number | null;
}

const ratio = (a: number | null, t: number | null): number | null => (a !== null && t !== null && t > 0 ? (a / t) * 100 : null);
const sumOf = (rows: readonly Row[], f: (r: Row) => number | null): number | null => {
  const v = rows.map(f).filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

function toRows(data: ApiMonth): Row[] {
  return data.locations
    .map((l) => {
      const ok = l.status === 'ok';
      const actual = ok ? l.actual : null;
      const monthly = ok ? l.target : null;
      const running = ok ? (l.achievement?.targetHariIni ?? null) : null;
      return {
        key: l.tempat,
        name: SITE_INFO[l.tempat].name,
        color: SITE_INFO[l.tempat].color,
        status: l.status,
        days: l.workingDays,
        monthly,
        running,
        dailyActual: ok ? (l.daily?.actual ?? null) : null,
        actual,
        runningGap: actual !== null && running !== null ? actual - running : null,
        monthlyGap: actual !== null && monthly !== null ? actual - monthly : null,
        runningPct: ratio(actual, running),
        monthlyPct: ratio(actual, monthly),
        targetVersion: l.targetVersion,
      };
    })
    .sort((a, b) => (b.runningPct ?? -1) - (a.runningPct ?? -1));
}

function Qty({ v }: { readonly v: number | null }) {
  return v === null ? <>—</> : <strong>{fmt(v)}</strong>;
}

function Gap({ v }: { readonly v: number | null }) {
  if (v === null) return <strong>—</strong>;
  const tone = v < 0 ? 'exec-negative' : v > 0 ? 'exec-positive' : '';
  return (
    <strong className={tone}>
      {v < 0 ? '−' : v > 0 ? '+' : ''}
      {fmt(Math.abs(v))}
    </strong>
  );
}

function TargetPair({ target, gap }: { readonly target: number | null; readonly gap: number | null }) {
  return (
    <dl className="exec-target-pair">
      <div>
        <dt>Target</dt>
        <dd>{target === null ? '—' : fmt(target)}</dd>
      </div>
      <div>
        <dt>Gap</dt>
        <dd>
          <Gap v={gap} />
        </dd>
      </div>
    </dl>
  );
}

function Cell({
  label,
  children,
  className,
  total,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly total?: boolean;
}) {
  return (
    <td role="cell" {...(className ? { className } : {})} {...(total ? { 'data-total': '' } : {})}>
      <span className="exec-cell-label" aria-hidden="true">
        {label}
      </span>
      {children}
    </td>
  );
}

export function Executive() {
  const { can } = useAuth();
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const [yr, setYr] = useState(now.getUTCFullYear());
  const [mo, setMo] = useState(now.getUTCMonth()); // 0-based seperti mockup S.mo
  const [data, setData] = useState<ApiMonth | null>(null);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<Partial<Record<Site, boolean>>>({});
  const [draft, setDraft] = useState<Partial<Record<Site, string>>>({});
  const [calendarFor, setCalendarFor] = useState<Site | null>(null);
  const [saving, setSaving] = useState(false);
  const canEdit = can('config.edit');

  const load = useCallback(async () => {
    setError('');
    try {
      setData((await api.get<ApiMonth>(`/api/v3/executive/month?year=${yr}&month=${mo + 1}`)).data);
    } catch (e) {
      setData(null);
      setError(e instanceof ApiError ? e.message : 'Data gagal dimuat.');
    }
  }, [yr, mo]);

  useEffect(() => {
    void load();
  }, [load]);

  const note = (text: string): void => {
    const el = document.getElementById('header-note');
    if (!el) return;
    el.textContent = text;
    setTimeout(() => {
      if (el.textContent === text) el.textContent = '';
    }, 3500);
  };

  const save = async (row: Row): Promise<void> => {
    const raw = draft[row.key] ?? String(row.monthly ?? '');
    const target = Number(raw);
    if (raw === '' || !Number.isFinite(target) || target < 0 || target > 1_000_000_000) {
      note('Target harus angka 0 sampai 1.000.000.000.');
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      await api.put('/api/v3/executive/target', {
        year: yr,
        month: mo + 1,
        tempat: row.key,
        target: Math.round(target),
        ...(row.targetVersion !== null ? { version: row.targetVersion } : {}),
      });
      setEdit({ ...edit, [row.key]: false });
      note('Target disimpan.');
      await load();
    } catch (e) {
      note(e instanceof ApiError ? e.message : 'Target gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const years: number[] = [];
  for (let y = 2024; y <= 2028; y += 1) years.push(y);
  const head = (
    <div className="exec-head">
      <div className="exec-period">
        <label>
          <span className="sr">Bulan</span>
          <select id="mo" value={mo} onChange={(e) => setMo(Number(e.target.value))}>
            {MON.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr">Tahun</span>
          <select id="yr" value={yr} onChange={(e) => setYr(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );

  if (error || !data) {
    return (
      <div className="page">
        <div className="exec-board">
          {head}
          <section className="exec-empty" aria-labelledby="exec-empty-title">
            <h2 id="exec-empty-title">{error ? 'Data tidak dapat dimuat' : 'Memuat data…'}</h2>
            {error ? (
              <p>
                {error}{' '}
                <button className="btn" type="button" onClick={() => void load()}>
                  Coba lagi
                </button>
              </p>
            ) : null}
          </section>
        </div>
      </div>
    );
  }

  const rows = toRows(data);
  const comparable = rows.filter((r) => r.actual !== null && r.monthly !== null);
  const monthlyPct = ratio(
    sumOf(comparable, (r) => r.actual),
    sumOf(comparable, (r) => r.monthly),
  );
  const scale = Math.max(
    105,
    Math.ceil(Math.max(0, monthlyPct ?? 0, ...rows.flatMap((r) => [r.monthlyPct ?? 0, r.runningPct ?? 0])) / 5) * 5 + 5,
  );
  const targetMark = `${((100 / scale) * 100).toFixed(3)}%`;
  const progress = (percent: number | null): ReactNode => {
    if (percent === null) return null;
    const width = `${((Math.min(scale, Math.max(0, percent)) / scale) * 100).toFixed(3)}%`;
    return (
      <span
        className={`exec-track ${achievementBand(percent)}`}
        aria-hidden="true"
        style={{ ['--exec-fill' as string]: width, ['--exec-target' as string]: targetMark }}
      >
        <i></i>
      </span>
    );
  };
  const bar = (label: string, percent: number | null): ReactNode => (
    <div className="exec-row-progress">
      <span className="exec-progress-caption">{label}</span>
      {progress(percent) ?? <span aria-hidden="true"></span>}
      <strong className={achievementBand(percent)} title={achievementLabel(percent)}>
        {pct(percent)}
      </strong>
    </div>
  );

  const stats: [string, ReactNode, number | null][] = [
    ['Total Actual Harian', <Qty v={sumOf(rows, (r) => r.dailyActual)} />, sumOf(rows, (r) => r.dailyActual)],
    ['Total Actual Kumulatif', <Qty v={sumOf(rows, (r) => r.actual)} />, sumOf(rows, (r) => r.actual)],
    ['Total Target Bulanan', <Qty v={sumOf(rows, (r) => r.monthly)} />, sumOf(rows, (r) => r.monthly)],
    ['Target Kumulatif', <Qty v={sumOf(rows, (r) => r.running)} />, sumOf(rows, (r) => r.running)],
    ['Gap Kumulatif', <Gap v={sumOf(rows, (r) => r.runningGap)} />, sumOf(rows, (r) => r.runningGap)],
    ['Gap Target Bulanan', <Gap v={sumOf(rows, (r) => r.monthlyGap)} />, sumOf(rows, (r) => r.monthlyGap)],
  ];
  const biggest = rows
    .filter((r) => (r.runningGap ?? 0) < 0)
    .reduce<Row | null>((w, r) => (!w || (r.runningGap ?? 0) < (w.runningGap ?? 0) ? r : w), null);
  const dailyDate =
    rows.find((r) => r.key === 'internal')?.dailyActual !== null
      ? data.locations.find((l) => l.tempat === 'internal')?.daily?.date
      : undefined;
  const columns = ['Lokasi', 'Actual Harian', 'Actual Kumulatif', 'Target Bulanan', 'Target Kumulatif', 'Pencapaian Actual'];
  const band = achievementBand(monthlyPct);

  return (
    <div className="page">
      <div className="exec-board">
        {head}
        <section className="exec-summary" aria-label="Ringkasan seluruh lokasi">
          <div className="exec-spotlight">
            <h2>Total Achievement</h2>
            <div className="exec-status metric-inline">
              <strong className="exec-spotlight-value">{pct(monthlyPct)}</strong>{' '}
              <AchievementCaption band={band} label={achievementLabel(monthlyPct)} />
            </div>
            {progress(monthlyPct)}
            <p>Actual / Target Bulanan</p>
          </div>
          <dl className="exec-stats">
            {stats.map(([label, value, raw]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className="metric-inline">
                  {value}
                  {raw === null ? null : (
                    <>
                      {' '}
                      <small>pcs</small>
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="exec-panel" aria-labelledby="exec-locations">
          <div className="exec-panel-head">
            <div>
              <h2 id="exec-locations">Achievement Ranking</h2>
              <p className="exec-date-note">
                {dailyDate ? `Actual harian · ${fd(dailyDate)}` : 'Actual harian belum tersedia untuk periode ini.'}
              </p>
            </div>
            {biggest ? (
              <div className="exec-attention">
                <span>Gap kumulatif terbesar</span>
                <p>
                  <a href={`#master-${biggest.key}`}>{biggest.name}</a> <Gap v={biggest.runningGap} /> <small>pcs</small>
                </p>
              </div>
            ) : null}
          </div>
          <div className="exec-table-wrap">
            <table className="exec-locations" role="table">
              <thead role="rowgroup">
                <tr role="row">
                  {columns.map((c) => (
                    <th key={c} scope="col" role="columnheader">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody role="rowgroup">
                {rows.flatMap((row) => {
                  const editing = canEdit && row.status === 'ok' && Boolean(edit[row.key]);
                  const tgt = draft[row.key] ?? String(row.monthly ?? '');
                  const onHold = row.status !== 'ok';
                  return [
                    <tr className="exec-location-row" role="row" key={row.key}>
                      <th scope="row" role="rowheader">
                        <div className="exec-location-heading">
                          <a className="exec-location-name" href={`#master-${row.key}`}>
                            <i aria-hidden="true" style={{ ['--exec-site' as string]: row.color }}></i>
                            {row.name}
                          </a>
                          <small className="exec-workdays">{onHold ? 'On Hold' : `${row.days} hari kerja/bulan`}</small>
                        </div>
                        {canEdit && !onHold ? (
                          <button
                            className="btn exec-edit"
                            type="button"
                            data-edit={row.key}
                            title={`Edit target ${row.name}`}
                            aria-controls={`exec-editor-row-${row.key}`}
                            aria-expanded={editing}
                            aria-label={`Edit target ${row.name}`}
                            onClick={() => {
                              setEdit({ ...edit, [row.key]: !editing });
                              setDraft({ ...draft, [row.key]: String(row.monthly ?? 0) });
                            }}
                          >
                            <Icon name="edit" size={16} />
                          </button>
                        ) : null}
                      </th>
                      <Cell label="Actual Harian" className="exec-actual">
                        <Qty v={row.dailyActual} />
                      </Cell>
                      <Cell label="Actual Kumulatif" className="exec-actual" total>
                        <Qty v={row.actual} />
                      </Cell>
                      <Cell label="Target Bulanan">
                        <TargetPair target={row.monthly} gap={row.monthlyGap} />
                      </Cell>
                      <Cell label="Target Kumulatif">
                        <TargetPair target={row.running} gap={row.runningGap} />
                      </Cell>
                      <Cell label="Pencapaian Actual">
                        <div className="exec-progress-pair">
                          {bar('Bulanan', row.monthlyPct)}
                          {bar('Kumulatif', row.runningPct)}
                        </div>
                      </Cell>
                    </tr>,
                    canEdit && !onHold ? (
                      <tr className="exec-editor-row" role="row" id={`exec-editor-row-${row.key}`} key={`${row.key}-ed`} hidden={!editing}>
                        <td role="cell" colSpan={6}>
                          {editing ? (
                            <div className="edp exec-editor" id={`exec-editor-${row.key}`}>
                              <label>
                                Target bulanan (pcs)
                                <input
                                  type="number"
                                  min="0"
                                  max="1000000000"
                                  step="1"
                                  id={`e-${row.key}-tgt`}
                                  value={tgt}
                                  onChange={(e) => setDraft({ ...draft, [row.key]: e.target.value })}
                                />
                              </label>
                              <div className="exec-edit-calendar">
                                <span>Hari kerja</span>
                                <button
                                  className="btn exec-calendar-btn"
                                  type="button"
                                  data-work-calendar={row.key}
                                  onClick={() => setCalendarFor(row.key)}
                                >
                                  <Icon name="cal" size={15} />
                                  Kalender Kerja <span>{row.days} hari</span>
                                </button>
                              </div>
                              <div className="exec-edit-summary">
                                <span>
                                  Plan harian{' '}
                                  <strong id={`e-${row.key}-pd`}>{tgt !== '' && row.days ? fmt(Number(tgt) / row.days) : '—'}</strong> pcs
                                </span>
                                <button
                                  className="btn pri"
                                  type="button"
                                  data-save={row.key}
                                  disabled={saving}
                                  onClick={() => void save(row)}
                                >
                                  Simpan
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>
          <p className="exec-table-key">
            Urut berdasarkan pencapaian kumulatif <span aria-hidden="true">·</span> Output dalam pcs <span aria-hidden="true">·</span>{' '}
            <i aria-hidden="true"></i> Garis target 100%
          </p>
          <div className="exec-achievement-key">
            <AchievementLegend />
          </div>
        </section>
      </div>
      {calendarFor ? (
        <WorkCalendar
          site={calendarFor}
          year={yr}
          month={mo + 1}
          onClose={(saved) => {
            setCalendarFor(null);
            if (saved) {
              note('Kalender kerja disimpan.');
              void load();
            }
          }}
        />
      ) : null}
    </div>
  );
}

export const __test = { toRows, P };
