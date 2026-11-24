// Format angka persis mockup: fmt = Math.round + id-ID; P = 1 desimal koma.
export const MON = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export const fmt = (v: number): string => Math.round(v).toLocaleString('id-ID');
export const P = (x: number): string => x.toFixed(1).replace('.', ',');
export const pct = (x: number | null): string => (x === null ? '—' : `${P(x)}%`);

/** "2026-11-09" → "9 November 2026". */
export function fd(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MON[Number(m) - 1] ?? ''} ${y ?? ''}`;
}
