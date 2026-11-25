// Port V.line mockup (layar kiosk/iPad) → /reporting/line-detail, /line-metrics, /reject.
import { useEffect, useState, type ReactNode } from 'react';
import type { LineDayMetrics, LineDetail as LD, LineStatus, RejectItem } from '@v3/shared';
import { Lgd } from '../components/common';
import { LineChart } from '../components/LineChart';
import { DayPicker, RangePicker } from '../components/Picker';
import { achievementBand } from '../lib/achievement';
import { useAuth } from '../lib/auth';
import { addD, dm2, presetRange, type Range } from '../lib/dates';
import { fd, fmt, MON } from '../lib/format';
import { Icon } from '../lib/icons';
import { achievedMetric, useConfig, type KpiRules } from '../lib/kpi';
import { useApi } from '../lib/useApi';

const STATUS: Readonly<Record<LineStatus, [string, string]>> = {
  running: ['RUNNING', 'gr'],
  waiting: ['STANDBY', 'or'],
  not_running: ['STOP', 'rd'],
  no_data: ['NO DATA', 'dm'],
  shift_not_found: ['NO DATA', 'dm'],
};
const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const lkv = (a: string, b: ReactNode, c?: string): ReactNode => (
  <div className="kv2" key={a}>
    <span>{a}</span>
    <b {...(c ? { className: c } : {})}>{b}</b>
  </div>
);
const lst = (t: string, c: string, x?: ReactNode): ReactNode => (
  <div className="lt2" style={{ borderLeftColor: `var(--${c})` }}>
    {t}
    {x}
  </div>
);
function Lper({ t, name, badge }: { readonly t: string; readonly name: string | null; readonly badge: string }) {
  return (
    <div className="pc">
      {lst(
        t,
        'acc',
        <>
          {' '}
          <i className="bg">{badge}</i>
        </>,
      )}
      <div className="pb">
        <div className="av88" role="img" aria-label="Foto belum tersedia">
          <Icon name="user" size={44} />
        </div>
        <b>{name ?? '—'}</b>
        <small>NIK —</small>
      </div>
    </div>
  );
}
function Lmc({
  lb,
  v,
  c,
  u,
  s,
  nb,
  badge,
}: {
  readonly lb: string;
  readonly v: ReactNode;
  readonly c: string;
  readonly u?: string;
  readonly s?: boolean;
  readonly nb?: boolean;
  readonly badge: string;
}) {
  return (
    <div className={`mc${s ? ' s' : ''}`} {...(nb ? { style: { borderRight: 0 } } : {})}>
      <div>
        <small>{lb}</small> <i className="bg">{badge}</i>
      </div>
      <div className="mv">
        <b className={c}>{v}</b>
        {u ? <small>{u}</small> : null}
      </div>
    </div>
  );
}
function Lav({ lb, p, c }: { readonly lb: string; readonly p: number | null; readonly c: string }) {
  return (
    <div className="av">
      <small>{lb}</small>
      <b className={c}>
        {p === null ? '-' : p}
        <em>%</em>
      </b>
      <div className="tk">
        <i className={c.startsWith('ach-') ? c : `bgc-${c}`} style={{ width: `${Math.max(0, Math.min(100, p ?? 0))}%` }}></i>
      </div>
    </div>
  );
}
const ecell = (l: string, v: ReactNode, c: string, u?: string): ReactNode => (
  <div className="ec" key={l}>
    <small>{l}</small>
    <div className="mv">
      <b className={c}>{v}</b>
      {u ? <small>{u}</small> : null}
    </div>
  </div>
);

function useClock(serverNow: string | undefined): Date {
  const [offset] = useState(() => (serverNow ? Date.parse(serverNow) - (Date.now() + 7 * 3600e3) : 0));
  const [t, setT] = useState(() => new Date(Date.now() + 7 * 3600e3 + offset));
  useEffect(() => {
    const id = setInterval(() => setT(new Date(Date.now() + 7 * 3600e3 + offset)), 1000);
    return () => clearInterval(id);
  }, [offset]);
  return t;
}

interface Hour {
  readonly s: string;
  readonly p: number | null;
  readonly a: number | null;
  readonly dev: number | null;
  readonly pct: number | null;
}

function HourTable({
  hr,
  cc,
  minWidth,
}: {
  readonly hr: readonly Hour[];
  readonly cc: (v: number | null) => string;
  readonly minWidth?: number;
}) {
  const rows: [string, (h: Hour) => ReactNode][] = [
    ['Output Plan', (h) => <td className="dm">{h.p === null ? '-' : fmt(h.p)}</td>],
    [
      'Output Actual',
      (h) => (
        <td className="gr" style={{ fontWeight: 700 }}>
          {h.a === null ? '-' : fmt(h.a)}
        </td>
      ),
    ],
    ['Kurang (Plan − Actual)', (h) => <td className={h.dev === null ? 'dm' : cc(h.pct)}>{h.dev === null ? '-' : fmt(h.dev)}</td>],
    [
      'Pencapaian',
      (h) => {
        const c = h.pct === null ? 'dm' : cc(h.pct);
        return (
          <td className={c} style={{ fontWeight: 700 }}>
            {h.pct === null ? '-' : `${h.pct}%`}
            {h.pct === null ? null : <span className={`pbar ${c}`} style={{ width: `${Math.min(h.pct, 100)}%` }}></span>}
          </td>
        );
      },
    ],
  ];
  return (
    <div className="tw">
      <table className="ht" {...(minWidth ? { style: { minWidth } } : {})}>
        <thead>
          <tr>
            <th>Keterangan</th>
            {hr.map((h, i) => (
              <th key={i}>{h.s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, cell], i) => (
            <tr key={label} {...(i % 2 ? {} : { className: 'z' })}>
              <td>{label}</td>
              {hr.map((h, j) => (
                <Cell key={j}>{cell(h)}</Cell>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const Cell = ({ children }: { readonly children: ReactNode }) => <>{children}</>;

export function LineDetail({ line }: { readonly line: string }) {
  const { me } = useAuth();
  const { kpi, raw } = useConfig();
  const today = me?.today ?? '';
  const clock = useClock(me?.now);
  const [mode, setMode] = useState<'live' | 'day' | 'range'>('live');
  const [day, setDay] = useState(today);
  const [shift, setShift] = useState<number | null>(null);
  const [rng, setRng] = useState<Range>(() => presetRange('7d', today));
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const refreshSec = Number((raw.get('config.display')?.value as { kioskRefresh?: number } | undefined)?.kioskRefresh ?? 10) || 10;
  const live = mode === 'live';
  const rg = mode === 'range';
  const detailUrl = rg
    ? null
    : `/api/v3/reporting/line-detail?line=${encodeURIComponent(line)}${live ? '' : `&date=${day}${shift ? `&shift=${shift}` : ''}`}`;
  const detail = useApi<LD>(detailUrl);
  const refDate = live ? (detail.data?.tanggal ?? today) : day;
  const month = useApi<{ rows: LineDayMetrics[] }>(
    rg ? null : `/api/v3/reporting/line-metrics?start=${refDate.slice(0, 7)}-01&end=${refDate}&line=${encodeURIComponent(line)}`,
  );
  const range = useApi<{ rows: LineDayMetrics[] }>(
    rg ? `/api/v3/reporting/line-metrics?start=${rng.f}&end=${rng.t}&line=${encodeURIComponent(line)}&perDay=1` : null,
  );
  const rejStart = rg ? rng.f : refDate;
  const rejEnd = rg ? rng.t : refDate;
  const rejects = useApi<RejectItem[]>(`/api/v3/reporting/reject?start=${rejStart}&end=${rejEnd}&line=${encodeURIComponent(line)}`);
  const machines = (
    (raw.get('config.machines')?.value as { rows?: { line: string; code: string; active: boolean }[] } | undefined)?.rows ?? []
  ).filter((m) => m.active && m.line === line);

  useEffect(() => {
    document.body.classList.add('kiosk');
    return () => document.body.classList.remove('kiosk');
  }, []);
  useEffect(() => {
    if (!live) return undefined;
    const id = setInterval(() => {
      detail.reload();
      rejects.reload();
    }, refreshSec * 1000);
    return () => clearInterval(id);
  }, [live, refreshSec, detail.reload, rejects.reload]);

  const cc = (v: number | null): string => achievementBand(v, kpi);
  const d = detail.data;
  const hist = !live;
  const badge = rg || hist ? 'REKAP' : 'LIVE';
  const st: LineStatus = (detail.status as LineStatus) || 'no_data';
  const ps: [string, string] = rg ? ['REKAP', 'or'] : hist ? ['HISTORIS', 'or'] : (STATUS[st] ?? STATUS.no_data);
  const rgs = `${dm2(rng.f)} – ${dm2(rng.t)}${rng.t.slice(0, 4) !== rng.f.slice(0, 4) ? '' : ` ${rng.t.slice(0, 4)}`}`;
  const tgl = refDate.replace(/-/g, '/');

  // Ringkasan kartu atas
  const rr = range.data?.rows.filter((r) => r.reports > 0) ?? [];
  const rsum = (f: (r: LineDayMetrics) => number): number => rr.reduce((a, r) => a + f(r), 0);
  const plan = rg ? rsum((r) => r.plan) : (d?.output_plan ?? null);
  const act = rg ? rsum((r) => r.actual) : (d?.output_total ?? null);
  const rej = rg ? rsum((r) => r.reject) : (d?.reject_qty ?? null);
  const ppm = rg
    ? act !== null && rej !== null && act + rej > 0
      ? Math.round((rej / (act + rej)) * 1e6)
      : 0
    : (d?.qty_reject_ppm ?? null);
  const dev = plan !== null && act !== null ? plan - act : null;
  const bek = plan && act !== null ? Math.round((act / plan) * 100) : null;
  const oeeVals = rr.filter((r) => r.oee !== null);
  // OEE rentang = rata-rata harian (label "rata-rata" seperti mockup); live/harian = OEE berbobot bulan berjalan.
  const oee = oeeVals.length ? Math.round(oeeVals.reduce((a, r) => a + (r.oee ?? 0), 0) / oeeVals.length) : null;
  const stm = rg ? rsum((r) => r.stoptime) : (d?.stoptime_total ?? null);
  const swi = d?.cycle_time_swi ?? null;
  const ca = d?.cycle_time_actual ?? null;
  const mo = month.data?.rows[0];

  const hr: Hour[] = rg
    ? rr.map((r) => ({
        s: dm2(r.date ?? ''),
        p: r.plan,
        a: r.actual,
        dev: r.plan - r.actual,
        pct: r.plan > 0 ? Math.round((r.actual / r.plan) * 100) : null,
      }))
    : (d?.hourly ?? []).map((h) => ({ s: h.label, p: h.output_plan, a: h.output_actual, dev: h.deviasi, pct: h.pencapaian }));

  let overlay: ReactNode = null;
  const dk = `${line}|${st}|${refDate}`;
  const badgeOv = (t: string, c: string): ReactNode => <div className={`pill2 ${c}`}>{t}</div>;
  if (rg) {
    if (!rr.length && !range.loading) overlay = badgeOv('Tidak ada data produksi pada periode ini', 'dm');
  } else if (st === 'not_running' && live && !dismissed[dk]) {
    overlay = (
      <div
        className="alarm"
        id="alarm"
        role="alertdialog"
        aria-label="Line tidak running"
        onClick={() => setDismissed({ ...dismissed, [dk]: true })}
      >
        <div className="at">LINE TIDAK RUNNING</div>
        <div className="as">
          Line {line} · {d?.shift ?? ''} · {d?.missing_fields.length ? 'data wajib belum lengkap' : 'belum ada data masuk'}
        </div>
        <div className="ah">Klik atau tekan Esc untuk menutup</div>
      </div>
    );
  } else if (hist && st === 'no_data') overlay = badgeOv('Tidak ada data produksi pada tanggal ini', 'dm');
  else if (hist && st === 'shift_not_found') overlay = badgeOv('Shift ini tidak beroperasi pada tanggal ini', 'dm');
  else if (hist && st === 'not_running') overlay = badgeOv('Data laporan shift ini belum lengkap', 'or');
  else if (st === 'waiting') overlay = badgeOv('Menunggu Data Shift', 'or');

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setDismissed((x) => ({ ...x, [dk]: true }));
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [dk]);

  const shifts = d?.available_shifts ?? [];
  const ctl = (
    <div className="lctl">
      <span className="shs">
        <button type="button" data-lmode="live" aria-pressed={live} onClick={() => setMode('live')}>
          ● Live
        </button>
        <button
          type="button"
          data-lmode="day"
          aria-pressed={mode === 'day'}
          onClick={() => {
            setMode('day');
            if (day === today) setDay(addD(today, -1));
          }}
        >
          Harian
        </button>
        <button type="button" data-lmode="range" aria-pressed={rg} onClick={() => setMode('range')}>
          Rentang
        </button>
      </span>
      {live ? null : rg ? (
        <RangePicker value={rng} today={today} onChange={setRng} />
      ) : (
        <DayPicker value={day} today={today} onChange={(v) => (setDay(v), setShift(null))} />
      )}
      {hist && !rg ? (
        <span className="shs">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              data-shift={n}
              aria-pressed={(shift ?? Number(/Shift\s*(\d)/.exec(d?.shift ?? '')?.[1] ?? 0)) === n}
              onClick={() => setShift(n)}
              disabled={!shifts.some((s) => s.startsWith(`Shift ${n}`)) && shift !== n}
            >
              Shift {n}
            </button>
          ))}
        </span>
      ) : null}
    </div>
  );

  const m4 = mo?.stoptime_4m ?? [0, 0, 0, 0, 0];
  const m4View: [string, number][] = [
    ['MACHINE', m4[0]],
    ['METHOD', m4[3]],
    ['MAN', m4[1]],
    ['MATERIAL', m4[2]],
  ];
  const best = rr.reduce<LineDayMetrics | null>((b, r) => (!b || (r.bekidoritsu ?? 0) > (b.bekidoritsu ?? 0) ? r : b), null);
  const worst = rr.reduce<LineDayMetrics | null>((b, r) => (!b || (r.bekidoritsu ?? 0) < (b.bekidoritsu ?? 0) ? r : b), null);
  const ok = rr.filter((r) => cc(r.bekidoritsu) === 'ach-green').length;
  const evalH = rg ? (
    <>
      <div className="eh">
        <i></i>
        <span className="ac">Ringkasan Periode · {rr.length} hari data</span>
        <i></i>
      </div>
      <div className="eg eg5">
        {ecell('Rata-rata Output / Hari', fmt(rr.length ? (act ?? 0) / rr.length : 0), 'gr', 'pcs')}
        {ecell('Hari Target Tercapai', `${ok} / ${rr.length}`, ok ? 'gr' : 'rd', 'hari')}
        {ecell('Hari Terbaik', best ? `${best.bekidoritsu ?? 0}%` : '-', cc(best?.bekidoritsu ?? null), best?.date ? dm2(best.date) : '')}
        {ecell(
          'Hari Terendah',
          worst ? `${worst.bekidoritsu ?? 0}%` : '-',
          cc(worst?.bekidoritsu ?? null),
          worst?.date ? dm2(worst.date) : '',
        )}
        {ecell('Total Reject', fmt(rej ?? 0), (rej ?? 0) > 0 ? 'ye' : 'tx', 'pcs')}
      </div>
    </>
  ) : (
    <>
      <div className="eh">
        <i></i>
        <span className="ac">
          Evaluasi Kinerja Line · {MON[Number(refDate.slice(5, 7)) - 1]} (s/d {fd(refDate)})
        </span>
        <i></i>
      </div>
      <div className="eg">
        {ecell('Total Output Actual (Bulan)', fmt(mo?.actual ?? 0), 'gr', 'pcs')}
        {ecell('Total Qty Reject (Bulan)', fmt(mo?.reject ?? 0), (mo?.reject ?? 0) > 0 ? 'ye' : 'tx', 'pcs')}
        {ecell(
          'Qty Reject PPM',
          fmt(mo?.reject_ppm ?? 0),
          (mo?.actual ?? 0) > 0 ? cc(achievedMetric(mo?.reject_ppm ?? null, 'ppm', kpi as KpiRules)) : 'tx',
          'PPM',
        )}
        <div className="e4">{m4View.map(([n, v]) => ecell(n, fmt(v), 'or', 'm'))}</div>
      </div>
    </>
  );
  const q = (rej ?? 0) > 0;
  const defs = rejects.data ?? [];
  const oeeShown = rg ? oee : (mo?.oee ?? null);

  return (
    <div className="ln">
      <div className="lnh">
        <button
          type="button"
          className="lnb"
          data-back="1"
          onClick={() => (history.length > 1 ? history.back() : (location.hash = 'lines'))}
        >
          <Icon name="back" size={15} /> Kembali
        </button>
        <div className="clk">
          <small>
            {DAYS[clock.getUTCDay()]}, {clock.getUTCDate()} {(MON[clock.getUTCMonth()] ?? '').slice(0, 3)} {clock.getUTCFullYear()}
          </small>
          <div id="clk" className="ct">
            {clock.toISOString().slice(11, 19)}
          </div>
        </div>
        <div className="lc2">
          <div className="ttl">
            {rg ? `REKAP DATA PRODUKSI · ${rgs}` : hist ? `REKAP DATA PRODUKSI · ${tgl}` : 'TAMPILAN DATA PRODUKSI REAL-TIME'}
          </div>
          <div className="sub2">
            {hist ? (
              <>
                <i className="dot2 or"></i>
                <span className="or">HISTORIS · bukan live</span>
              </>
            ) : (
              <>
                <i className="dot2 gr pulse"></i>
                <span>Data i-Reporter · {refreshSec} dtk</span>
                <small id="kiosk-updated">{detail.loading ? ' Memperbarui…' : ''}</small>
              </>
            )}
          </div>
          {ctl}
        </div>
        <div className="rl">
          <div>
            <small>LINE</small> <b className="lcode">{line}</b>
          </div>
          <span className={`ps ${ps[1]}`}>{ps[0]}</span>
          {d?.product_name ? <small className="pn">{d.product_name}</small> : null}
        </div>
      </div>
      {detail.error || range.error ? (
        <div className="pill2 rd" role="alert">
          {detail.error || range.error}
        </div>
      ) : null}
      <div className="lng">
        <div className="lnl" tabIndex={0}>
          <div className="li">
            {lkv(rg ? 'Periode' : 'Tanggal', rg ? rgs : tgl, 'ac')}
            {lkv('CL No', d?.cl_no ?? '-', 'ac')}
            {lkv('Nama Produk', d?.product_name ?? '-')}
            {machines.length ? lkv('Mesin', machines.map((m) => m.code).join(', ')) : null}
            <small className="kc">Kode Cetak</small>
            <div className="qr">
              <div>
                <small>QR CODE</small>
                <em>belum tersedia</em>
              </div>
            </div>
          </div>
          <Lper t="Cell Leader" name={d?.cell_leader_nama ?? null} badge={badge} />
          <Lper t="PJ Teknisi" name={d?.pj_teknis_nama ?? null} badge={badge} />
          <Lper t="Inspector" name={d?.inspector_nama ?? null} badge={badge} />
          <div className="lf" id="lf">
            {clock.toISOString().slice(11, 19).replace(/:/g, '.')}
          </div>
        </div>
        <div className="lnc">
          <div className="g4">
            <Lmc lb="Output Plan" v={plan === null ? '-' : fmt(plan)} c="gr" u="pcs" badge={badge} />
            <Lmc lb="Output Actual" v={act === null ? '-' : fmt(act)} c="tx" u="pcs" badge={badge} />
            <Lmc
              lb="Kurang (Plan − Actual)"
              v={dev === null ? '-' : `${dev > 0 ? '+' : ''}${fmt(dev)}`}
              c={plan ? cc(act !== null ? (act / plan) * 100 : null) : 'tx'}
              u="pcs"
              badge={badge}
            />
            <Lmc
              lb="Qty Reject PPM"
              v={ppm === null ? '-' : fmt(ppm)}
              c={(act ?? 0) > 0 ? cc(achievedMetric(ppm, 'ppm', kpi)) : 'tx'}
              u="PPM"
              nb
              badge={badge}
            />
          </div>
          <div className="g3">
            <Lmc lb="Cycle Time SWI" v={swi === null ? '-' : swi} c="gr" u="sec" s badge={badge} />
            <Lmc
              lb="Cycle Time Actual"
              v={ca === null ? '-' : ca}
              c={ca !== null && swi !== null && ca > swi ? 'rd' : 'gr'}
              u="sec"
              s
              badge={badge}
            />
            <Lmc lb="Total Stoptime" v={stm === null ? '-' : fmt(stm)} c="or" u="menit" s nb badge={badge} />
          </div>
          <div className="avs">
            <Lav lb="Bekidoritsu" p={plan ? bek : null} c={cc(plan ? bek : null)} />
            <Lav
              lb={`OEE${rg ? ' (rata-rata)' : ' (bulan berjalan)'}`}
              p={oeeShown === null ? null : Math.round(oeeShown)}
              c={cc(achievedMetric(oeeShown, 'oee', kpi))}
            />
          </div>
          {evalH}
          <div className="eh h">
            <span className="gr">{rg ? 'Rekapitulasi Produksi Per Hari' : 'Rekapitulasi Produksi Per Jam'}</span>
          </div>
          {rg && rr.length > 1 ? (
            <div style={{ padding: '8px 14px 0' }}>
              <LineChart
                series={[
                  { d: rr.map((r) => r.plan), c: 'var(--dim)', dash: true },
                  { d: rr.map((r) => r.actual), c: 'var(--acc)', w: 3 },
                ]}
                labels={rr.map((r) => dm2(r.date ?? ''))}
                H={170}
                al={`Tren output harian line ${line}`}
              />
              <Lgd
                items={[
                  ['Plan', 'var(--dim)', true],
                  ['Actual', 'var(--acc)'],
                ]}
              />
            </div>
          ) : null}
          <HourTable hr={hr} cc={cc} {...(rg ? { minWidth: Math.max(640, rr.length * 72 + 110) } : {})} />
        </div>
        <div className="lnr">
          <div className="lt2" style={{ borderLeftColor: q ? 'var(--rd)' : 'var(--gr)' }}>
            Quality Status <i className="bg">{hist ? 'REKAP' : 'LIVE'}</i>
          </div>
          <div className="qs">
            <b className={q ? 'rd' : 'gr'}>{q ? 'ALERT' : 'GOOD'}</b>
            <div className="g2">
              <div>
                <small>REJECT</small>
                <b className={q ? 'rd' : 'tx'}>
                  {fmt(rej ?? 0)}
                  <em>pcs</em>
                </b>
              </div>
              <div>
                <small>PPM</small>
                <b className={q ? 'rd' : 'tx'}>{fmt(ppm ?? 0)}</b>
              </div>
            </div>
          </div>
          {lst('Detail Reject', 'rd')}
          <div className="tw" style={{ flex: 1 }}>
            <table className="ht dr">
              <thead>
                <tr>
                  <th className="rd" style={{ textAlign: 'left' }}>
                    Defect Name
                  </th>
                  <th className="rd">QTY</th>
                </tr>
              </thead>
              <tbody>
                {defs.length ? (
                  defs.map((x) => (
                    <tr key={x.name}>
                      <td style={{ textAlign: 'left' }}>{x.name}</td>
                      <td className="rd">{fmt(x.qty)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="dm" style={{ textAlign: 'center' }}>
                      Tidak ada reject
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {overlay}
    </div>
  );
}
