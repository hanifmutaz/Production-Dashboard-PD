// Port achievementBand/Label/Caption/Legend mockup. Ambang default 90/100 (Settings → KPI & Ambang).
export interface Thresholds {
  readonly yellow: number;
  readonly green: number;
}
export const DEFAULT_THRESHOLDS: Thresholds = { yellow: 90, green: 100 };

export type BandClass = 'ach-green' | 'ach-yellow' | 'ach-red' | '';

export function achievementBand(percent: number | null, t: Thresholds = DEFAULT_THRESHOLDS): BandClass {
  if (percent === null || !Number.isFinite(percent)) return '';
  // Warna dan angka 1 desimal berubah di batas yang sama.
  const value = Math.round((percent + Number.EPSILON) * 10) / 10;
  return value >= t.green ? 'ach-green' : value >= t.yellow ? 'ach-yellow' : 'ach-red';
}

export function achievementLabel(percent: number | null, t: Thresholds = DEFAULT_THRESHOLDS): string {
  return { 'ach-green': 'Tercapai', 'ach-yellow': 'Mendekati target', 'ach-red': 'Di bawah target', '': 'Tanpa target / data' }[
    achievementBand(percent, t)
  ];
}

export function AchievementCaption({ band, label }: { readonly band: BandClass; readonly label: string }) {
  return (
    <span className={`ach-caption ${band}`}>
      {band ? <i className="status-mark" aria-hidden="true"></i> : null}
      {label}
    </span>
  );
}

export function AchievementLegend({ t = DEFAULT_THRESHOLDS }: { readonly t?: Thresholds }) {
  const n = (v: number): string => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(v);
  const items: [BandClass, string, string][] = [
    ['ach-red', 'Di bawah target', `< ${n(t.yellow)}%`],
    ['ach-yellow', 'Mendekati target', `${n(t.yellow)}% hingga < ${n(t.green)}%`],
    ['ach-green', 'Tercapai', `≥ ${n(t.green)}%`],
  ];
  return (
    <div className="achievement-legend" aria-label="Legenda pencapaian">
      {items.map(([band, title, range]) => (
        <span key={band} className={band}>
          <i aria-hidden="true"></i>
          <b>{title}</b> {range}
        </span>
      ))}
    </div>
  );
}
