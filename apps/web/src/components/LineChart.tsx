// Port lc() mockup: grafik garis sederhana (plan putus-putus, actual tebal).
import { fmt } from '../lib/format';

export interface ChartSeries {
  readonly d: readonly (number | null)[];
  readonly c: string;
  readonly w?: number;
  readonly dash?: boolean;
}

export function LineChart({
  series,
  labels,
  H = 200,
  al = 'Grafik',
}: {
  readonly series: readonly ChartSeries[];
  readonly labels: readonly string[];
  readonly H?: number;
  readonly al?: string;
}) {
  const W = 800;
  const pl = 70;
  const pb = 22;
  const pt = 8;
  const pr = 8;
  const n = labels.length;
  let mx = 0;
  for (const s of series) for (const v of s.d) if (v !== null && v > mx) mx = v;
  mx = mx || 1;
  const x = (i: number): number => pl + (W - pl - pr) * (n === 1 ? 0.5 : i / Math.max(1, n - 1));
  const y = (v: number): number => pt + (H - pt - pb) * (1 - v / mx);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={al} style={{ display: 'block' }}>
      {[0, 1, 2, 3, 4].map((t) => {
        const yy = pt + ((H - pt - pb) * t) / 4;
        return (
          <g key={t}>
            <line x1={pl} x2={W - pr} y1={yy} y2={yy} stroke="var(--bd)" />
            <text x={pl - 6} y={yy + 4} textAnchor="end" fontSize="10" fill="var(--dim)">
              {fmt(mx * (1 - t / 4))}
            </text>
          </g>
        );
      })}
      {labels.map((l, i) =>
        n <= 12 || i % 3 === 0 ? (
          <text key={`l${i}`} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--dim)">
            {l}
          </text>
        ) : null,
      )}
      {series.map((s, si) => {
        let d = '';
        let up = false;
        s.d.forEach((v, i) => {
          if (v === null) {
            up = false;
            return;
          }
          d += `${up ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
          up = true;
        });
        return <path key={si} d={d} fill="none" stroke={s.c} strokeWidth={s.w ?? 2.5} {...(s.dash ? { strokeDasharray: '5 4' } : {})} />;
      })}
    </svg>
  );
}
