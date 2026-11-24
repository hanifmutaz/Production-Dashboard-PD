// Port V.stoptime + stRows mockup → /reporting/summary/range, /line-metrics, /stoptime.
import { useState } from 'react';
import type { LineDayMetrics, SummaryTotals } from '@v3/shared';
import { CATS, CardMetric, LocTabs, M4, PageLead, Soon, Tcard } from '../components/common';
import { useAuth } from '../lib/auth';
import { fd, fmt } from '../lib/format';
import { useApi } from '../lib/useApi';
import { useSiteCounts } from './Master';

type Summary = SummaryTotals & { readonly hasData: boolean };
interface StopEvent {
  readonly line: string;
  readonly date: string;
  readonly kategori: string | null;
  readonly masalah: string | null;
  readonly minute: number | null;
}

function Kp({ l, v, d, tone }: { readonly l: string; readonly v: string; readonly d: string; readonly tone: string }) {
  return (
    <div className="card">
      <div className="kl">{l}</div>
      <CardMetric value={v} detail={d} tone={tone} />
    </div>
  );
}

export function Stoptime({ site }: { readonly site: string }) {
  const { me } = useAuth();
  const today = me?.today ?? '';
  const start = `${today.slice(0, 7)}-01`;
  const counts = useSiteCounts(today);
  const [cat, setCat] = useState('all');
  const internal = site === 'internal';
  const month = useApi<Summary>(internal ? `/api/v3/reporting/summary/range?start=${start}&end=${today}&location=internal` : null);
  const day = useApi<Summary>(internal ? `/api/v3/reporting/summary/range?start=${today}&end=${today}&location=internal` : null);
  const lines = useApi<{ rows: LineDayMetrics[] }>(
    internal ? `/api/v3/reporting/line-metrics?start=${start}&end=${today}&location=internal` : null,
  );
  const events = useApi<{ events: StopEvent[] }>(
    internal ? `/api/v3/reporting/stoptime?start=${start}&end=${today}&location=internal` : null,
  );

  if (!internal) {
    return (
      <div className="page">
        <LocTabs current={site} prefix="stoptime-" counts={counts} />
        <Soon>Lokasi ini On Hold — belum ada kejadian stoptime dari subcont.</Soon>
      </div>
    );
  }
  const ev = events.data?.events ?? [];
  const total = month.data?.stoptime_total ?? 0;
  const perLine = (lines.data?.rows ?? [])
    .filter((r) => r.stoptime_4m.some((v) => v > 0))
    .sort((a, b) => b.stoptime_4m.reduce((x, y) => x + y, 0) - a.stoptime_4m.reduce((x, y) => x + y, 0))
    .map((r) => {
      const t = r.stoptime_4m.reduce((x, y) => x + y, 0);
      const [machine, man, material, method, other] = r.stoptime_4m;
      return [r.line, `${fmt(machine)} m`, `${fmt(man)} m`, `${fmt(material)} m`, `${fmt(method)} m`, `${fmt(other)} m`, <b>{fmt(t)} m</b>];
    });
  const shown = ev
    .filter((e) => cat === 'all' || e.kategori === cat)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.minute ?? 0) - (a.minute ?? 0));
  return (
    <div className="page">
      <PageLead note={`Data i-Reporter · ${fd(start)} – ${fd(today)}`} />
      <LocTabs current={site} prefix="stoptime-" counts={counts} />
      {month.error ? (
        <p className="sb" role="alert">
          {month.error}
        </p>
      ) : null}
      <div className="kpis">
        <Kp l="Total stoptime bulanan" v={fmt(total)} d="menit" tone="bad" />
        <Kp l="Total stoptime hari ini" v={fmt(day.data?.stoptime_total ?? 0)} d="menit" tone="wa" />
        <Kp l="Jumlah kejadian" v={fmt(ev.length)} d="bulan ini" tone="" />
        <Kp
          l="Rata-rata per kejadian"
          v={ev.length ? fmt(ev.reduce((a, e) => a + (e.minute ?? 0), 0) / ev.length) : '—'}
          d="menit"
          tone=""
        />
      </div>
      <div className="row">
        <div className="card">
          <h2>Stoptime 4M Bulanan</h2>
          <div className="sb"></div>
          <M4 values={month.data?.stoptime_4m ?? [0, 0, 0, 0, 0]} />
        </div>
        <div className="card">
          <h2>Stoptime 4M Harian</h2>
          <div className="sb"></div>
          <M4 values={day.data?.stoptime_4m ?? [0, 0, 0, 0, 0]} />
        </div>
      </div>
      <div style={{ height: 14 }}></div>
      <Tcard
        title="Stoptime per Line"
        sub="Urut dari stoptime tertinggi (bulan ini)"
        head={['Line', 'Machine', 'Man', 'Material', 'Method', 'Other', 'Total']}
        rows={perLine.length ? perLine : [['Belum ada stoptime', '—', '—', '—', '—', '—', '—']]}
      />
      <div className="card np" style={{ marginTop: 14 }}>
        <div style={{ padding: '16px 18px 10px' }}>
          <h2>Daftar Kejadian</h2>
          <div className="chips" style={{ marginTop: 10 }}>
            {['all', ...CATS].map((c) => (
              <button key={c} className="chip b" type="button" data-cat={c} aria-pressed={cat === c} onClick={() => setCat(c)}>
                {c === 'all' ? 'Semua' : c}
              </button>
            ))}
          </div>
        </div>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Line</th>
                <th>Kategori 4M</th>
                <th style={{ textAlign: 'left' }}>Penyebab</th>
                <th>Durasi</th>
              </tr>
            </thead>
            <tbody id="strows">
              {shown.length ? (
                shown.slice(0, 500).map((e, i) => (
                  <tr key={i}>
                    <td>{fd(e.date)}</td>
                    <td>
                      <a href={`#line-${e.line.toLowerCase()}`} style={{ color: 'var(--acc)' }}>
                        {e.line}
                      </a>
                    </td>
                    <td>{e.kategori ?? '—'}</td>
                    <td style={{ textAlign: 'left' }}>{e.masalah ?? '—'}</td>
                    <td>{e.minute === null ? '—' : `${fmt(e.minute)} m`}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center' }}>
                    Belum ada kejadian
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
