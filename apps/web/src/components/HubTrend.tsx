// Port <hub-output-trend> mockup: garis output harian per lokasi (SVG responsif + tooltip + keyboard).
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { fd, fmt, MON } from '../lib/format';

export interface TrendSeries {
  readonly site: string;
  readonly name: string;
  readonly values: readonly (number | null)[];
}

interface Plot {
  readonly x: (i: number) => number;
  readonly y: (v: number) => number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly height: number;
  readonly topValue: number;
  readonly step: number;
}

function makePlot(width: number, days: number, series: readonly TrendSeries[]): Plot {
  const peak = Math.max(0, ...series.flatMap((l) => l.values.filter((v): v is number => v !== null && Number.isFinite(v))));
  const rough = Math.max(1, peak / 4);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((n) => n * magnitude).find((n) => n >= rough) ?? rough;
  const topValue = peak > 0 ? Math.max(2, Math.ceil(peak / step)) * step : 4;
  const height = width < 420 ? 226 : 282;
  const left = Math.max(33, fmt(topValue).length * 7 + 11);
  const right = width - 29;
  const top = 16;
  const bottom = height - 32;
  const x = (i: number): number => (days === 1 ? (left + right) / 2 : left + (i * (right - left)) / (days - 1));
  const y = (v: number): number => bottom - ((bottom - top) * v) / topValue;
  return { x, y, left, right, top, bottom, height, topValue, step };
}

// Tag custom element yang sama dengan mockup agar aturan CSS `hub-output-trend{...}` berlaku.
const HubEl = 'hub-output-trend' as unknown as 'div';

export function HubTrend({ days, series }: { readonly days: readonly string[]; readonly series: readonly TrendSeries[] }) {
  const canvas = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const [status, setStatus] = useState('');
  const [first, setFirst] = useState(true);
  const has = series.some((l) => l.values.some((v) => v !== null && Number.isFinite(v)));

  useEffect(() => {
    const el = canvas.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry?.contentRect.width ?? 0)));
    ro.observe(el);
    setWidth(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, [has]);
  useEffect(() => {
    if (width > 0 && first) {
      const t = setTimeout(() => setFirst(false), 1200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [width, first]);

  if (!has) return <p className="sb">Belum ada data produksi untuk ditampilkan.</p>;

  const labels = days.map((d) => `${Number(d.slice(8))} ${(MON[Number(d.slice(5, 7)) - 1] ?? '').slice(0, 3)}`);
  const count = days.length;
  const plot = width > 0 ? makePlot(width, count, series) : null;
  const quantity = (v: number | null | undefined): string =>
    v !== null && v !== undefined && Number.isFinite(v) ? `${fmt(v)} pcs` : 'Belum ada laporan';

  const indexAt = (e: PointerEvent<HTMLDivElement>): number | null => {
    if (!plot || !canvas.current) return null;
    const svg = canvas.current.querySelector('svg');
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < plot.left - 12 || x > plot.right + 12 || y < plot.top - 10 || y > plot.bottom + 27) return null;
    const last = count - 1;
    return Math.min(last, Math.max(0, Math.round(((x - plot.left) * last) / (plot.right - plot.left))));
  };
  const inspect = (i: number, announce = false): void => {
    setSel(i);
    if (announce) setStatus(`${fd(days[i] ?? '')}. ${series.map((s) => `${s.name} ${quantity(s.values[i])}`).join('. ')}`);
  };
  const clear = (): void => {
    setSel(null);
    setPinned(false);
    setStatus('');
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const last = count - 1;
    const cur = sel ?? last;
    const next = ({ ArrowLeft: Math.max(0, cur - 1), ArrowRight: Math.min(last, cur + 1), Home: 0, End: last } as Record<string, number>)[
      e.key
    ];
    if (e.key === 'Escape' && sel !== null) {
      e.preventDefault();
      e.stopPropagation();
      clear();
    } else if (next !== undefined) {
      e.preventDefault();
      inspect(next, true);
    }
  };

  let svgBody = null;
  let tooltipLeft = 0;
  if (plot) {
    const { x, y, left, right, bottom, topValue, step } = plot;
    const horizontal = [];
    for (let v = 0; v <= topValue; v += step) {
      const row = y(v);
      horizontal.push(
        <g key={v}>
          <line className="hub-trend-grid" x1={left} x2={right} y1={row} y2={row} />
          <text className="hub-trend-tick" x={left - 8} y={row + 4} textAnchor="end">
            {fmt(v)}
          </text>
        </g>,
      );
    }
    const tickCount = Math.min(count, Math.max(2, Math.floor((right - left) / 58) + 1), 8);
    const ticks = Array.from({ length: tickCount }, (_, i) => Math.round((i * (count - 1)) / Math.max(1, tickCount - 1)));
    const markerStep = Math.max(1, Math.ceil(count / ((right - left) / 20)));
    let area = '';
    const lines = series.map(({ site, values }) => {
      const paths: string[] = [];
      const markers: [number, number][] = [];
      let points: [number, number][] = [];
      const close = (): void => {
        if (!points.length) return;
        const [fx, fy] = points[0] ?? [0, 0];
        let path = `M${fx} ${fy}`;
        for (let i = 1; i < points.length; i += 1) {
          const [ax, ay] = points[i - 1] ?? [0, 0];
          const [bx, by] = points[i] ?? [0, 0];
          const h = (bx - ax) / 3;
          path += `C${ax + h} ${ay} ${bx - h} ${by} ${bx} ${by}`;
        }
        paths.push(path);
        if (site === 'internal' && points.length > 1) area += `${path}L${points.at(-1)?.[0] ?? 0} ${bottom}L${fx} ${bottom}Z`;
        points = [];
      };
      values.forEach((v, i) => {
        if (v === null || !Number.isFinite(v)) {
          close();
          return;
        }
        const cx = x(i);
        const cy = y(v);
        const nextV = values[i + 1];
        if (!points.length || nextV === null || nextV === undefined || !Number.isFinite(nextV) || i % markerStep === 0)
          markers.push([cx, cy]);
        points.push([cx, cy]);
      });
      close();
      return (
        <g key={site} className={`hub-series-${site}`} data-hub-series={site}>
          <path className="hub-trend-line" d={paths.join('')} />
          {markers.map(([cx, cy]) => (
            <circle key={`${cx}`} className="hub-trend-marker" cx={cx} cy={cy} r="2.7" />
          ))}
        </g>
      );
    });
    const current = sel !== null ? x(sel) : 0;
    const tipWidth = tip.current?.offsetWidth ?? 180;
    tooltipLeft = Math.max(4, Math.min(width - tipWidth - 4, current + tipWidth + 12 <= width ? current + 12 : current - tipWidth - 12));
    svgBody = (
      <>
        <defs>
          <linearGradient id="hub-trend-fill" className="hub-series-internal" x2="0%" y2="100%">
            <stop offset="0" stopColor="var(--hub-series)" stopOpacity=".21" />
            <stop offset="1" stopColor="var(--hub-series)" stopOpacity=".015" />
          </linearGradient>
        </defs>
        {horizontal}
        {ticks.map((i) => (
          <text key={`d${i}`} className="hub-trend-tick" x={x(i)} y={bottom + 22} textAnchor="middle">
            {labels[i]}
          </text>
        ))}
        <g {...(first ? { className: 'hub-trend-reveal' } : {})}>
          {area ? <path className="hub-trend-area hub-series-internal" d={area} /> : null}
          {lines}
        </g>
        <g className="hub-trend-cursor">
          {sel !== null ? (
            <>
              <line className="hub-trend-guide" x1={current} x2={current} y1={plot.top} y2={plot.bottom} />
              {series
                .filter((s) => {
                  const v = s.values[sel];
                  return v !== null && v !== undefined && Number.isFinite(v);
                })
                .map((s) => (
                  <circle
                    key={s.site}
                    className={`hub-trend-focus-marker hub-series-${s.site}`}
                    cx={current}
                    cy={y(s.values[sel] ?? 0)}
                    r="5"
                  />
                ))}
            </>
          ) : null}
        </g>
      </>
    );
  }

  return (
    <HubEl>
      <div className="hub-trend-legend">
        {series.map(({ site, name }) => (
          <span key={site} className={`hub-series-${site}`}>
            <i className="hub-trend-key" aria-hidden="true"></i>
            {name}
          </span>
        ))}
      </div>
      <p className="sr" id="hub-trend-instructions">
        Gunakan panah kiri dan kanan untuk memilih tanggal. Tekan Escape untuk menutup rincian.
      </p>
      <div
        className="hub-trend-canvas"
        tabIndex={0}
        role="group"
        aria-label="Grafik output harian per lokasi dalam pcs"
        aria-describedby="hub-trend-instructions"
        ref={canvas}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse' && !pinned) {
            const i = indexAt(e);
            if (i === null) clear();
            else if (i !== sel) inspect(i);
          }
        }}
        onPointerLeave={() => {
          if (!pinned) clear();
        }}
        onClick={(e) => {
          const i = indexAt(e as unknown as PointerEvent<HTMLDivElement>);
          if (i === null || (pinned && i === sel)) {
            clear();
            return;
          }
          setPinned(true);
          inspect(i, true);
        }}
        onBlur={clear}
        onKeyDown={onKey}
      >
        <svg className="hub-output-plot" aria-hidden="true" {...(plot ? { viewBox: `0 0 ${width} ${plot.height}` } : {})}>
          {svgBody}
        </svg>
        <div className="hub-trend-tooltip" role="tooltip" hidden={sel === null} ref={tip} style={{ left: `${tooltipLeft}px` }}>
          {sel !== null ? (
            <>
              <strong>{fd(days[sel] ?? '')}</strong>
              {series.map((s) => (
                <div key={s.site} className={`hub-trend-tooltip-row hub-series-${s.site}`}>
                  <i aria-hidden="true"></i>
                  <span>{s.name}</span>
                  <b>{quantity(s.values[sel])}</b>
                </div>
              ))}
            </>
          ) : null}
        </div>
      </div>
      <div className="sr" role="status">
        {status}
      </div>
    </HubEl>
  );
}
