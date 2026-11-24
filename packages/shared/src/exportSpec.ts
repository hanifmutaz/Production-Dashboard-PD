// Spesifikasi dataset Export — port objek DS & exportTemplates mockup. Dipakai api (builder) & web (UI).
// [key, label, default terpilih, belum tersedia]
export type ExportColumn = readonly [string, string, boolean, boolean?];

export interface ExportDataset {
  readonly t: string;
  readonly d: string;
  readonly agg?: boolean;
  readonly cols: readonly ExportColumn[];
}

export const EXPORT_DATASETS = {
  exec: {
    t: 'Ringkasan Executive',
    d: 'Actual harian dan kumulatif, target, gap, serta hari kerja per lokasi',
    cols: [
      ['period', 'Bulan', true],
      ['cutoff', 'Kumulatif sampai', true],
      ['day', 'Tanggal harian', true],
      ['lok', 'Lokasi', true],
      ['daily', 'Actual harian (pcs)', true],
      ['actual', 'Actual kumulatif (pcs)', true],
      ['monthly', 'Target bulanan (pcs)', true],
      ['running', 'Target kumulatif (pcs)', true],
      ['runningGap', 'Gap kumulatif (pcs)', true],
      ['monthlyGap', 'Gap bulanan (pcs)', true],
      ['days', 'Hari kerja bulan', true],
      ['runningPct', 'Pencapaian kumulatif (%)', true],
      ['monthlyPct', 'Pencapaian bulanan (%)', true],
    ],
  },
  loc_day: {
    t: 'Ringkasan per lokasi',
    d: 'Output, bekidoritsu, sogo/shugyo, reject, stoptime, OEE per lokasi',
    agg: true,
    cols: [
      ['tgl', 'Tanggal', true],
      ['lok', 'Lokasi', true],
      ['pl', 'Output plan', true],
      ['ac', 'Output actual', true],
      ['beki', 'Bekidoritsu (%)', true],
      ['so', 'Sogo (menit)', true],
      ['sh', 'Shugyo (menit)', true],
      ['rej', 'Jumlah reject', true],
      ['ppm', 'Reject ppm', true],
      ['st', 'Total stoptime (menit)', true],
      ['oee', 'OEE (%)', true],
      ['la', 'Line aktif', false],
    ],
  },
  line_day: {
    t: 'Performa per line',
    d: 'Plan, actual, deviasi, reject, stoptime per line',
    agg: true,
    cols: [
      ['tgl', 'Tanggal', true],
      ['lok', 'Lokasi', true],
      ['line', 'Line', true],
      ['prod', 'Nama produk', true],
      ['pl', 'Output plan', true],
      ['ac', 'Output actual', true],
      ['dev', 'Deviasi (Plan − Actual)', true],
      ['beki', 'Bekidoritsu (%)', true],
      ['so', 'Sogo (menit)', false],
      ['sh', 'Shugyo (menit)', false],
      ['rej', 'Reject', true],
      ['ppm', 'Reject ppm', false],
      ['st', 'Stoptime (menit)', true],
      ['oee', 'OEE (%)', false],
    ],
  },
  line_hour: {
    t: 'Output per jam',
    d: 'Plan vs actual setiap jam, per line dan shift',
    cols: [
      ['tgl', 'Tanggal', true],
      ['lok', 'Lokasi', true],
      ['line', 'Line', true],
      ['shift', 'Shift', true],
      ['jam', 'Jam', true],
      ['pl', 'Output plan', true],
      ['ac', 'Output actual', true],
      ['dev', 'Deviasi (Plan − Actual)', true],
      ['pct', 'Pencapaian (%)', true],
    ],
  },
  line_shift: {
    t: 'Output per shift',
    d: 'Plan dan actual dari laporan shift',
    cols: [
      ['tgl', 'Tanggal', true],
      ['lok', 'Lokasi', true],
      ['line', 'Line No', true],
      ['shift', 'Shift', true],
      ['pl', 'Output plan', true],
      ['ac', 'Output actual', true],
      ['dev', 'Deviasi (Plan − Actual)', true],
      ['beki', 'Bekidoritsu (%)', true],
    ],
  },
  line_product: {
    t: 'Output per produk',
    d: 'Produk di laporan shift',
    cols: [
      ['tgl', 'Tanggal', true],
      ['lok', 'Lokasi', true],
      ['line', 'Line No', true],
      ['shift', 'Shift', true],
      ['cl', 'CL No', true],
      ['prod', 'Nama produk', true],
      ['mo', 'MO No', true],
      ['qty', 'Qty (pcs)', true],
    ],
  },
  stop: {
    t: 'Kejadian stoptime',
    d: 'Kejadian dari halaman Stoptime',
    cols: [
      ['no', 'No', true],
      ['line', 'Line No', true],
      ['shift', 'Shift', true],
      ['kat', 'Kategori', true],
      ['sebab', 'Masalah', true],
      ['dur', 'Menit', true],
      ['tgl', 'Tanggal', true],
      ['lok', 'Lokasi', false],
    ],
  },
  rej: {
    t: 'Detail reject',
    d: 'Reject per line dan nama defect',
    cols: [
      ['tgl', 'Tanggal', true],
      ['lok', 'Lokasi', true],
      ['line', 'Line', true],
      ['shift', 'Shift', false],
      ['defect', 'Defect', true],
      ['qty', 'Qty (pcs)', true],
    ],
  },
} as const satisfies Record<string, ExportDataset>;

export type ExportDatasetKey = keyof typeof EXPORT_DATASETS;
export const EXPORT_DATASET_KEYS = Object.keys(EXPORT_DATASETS) as ExportDatasetKey[];

export const EXPORT_FORMATS = [
  ['xlsx', 'Excel (.xlsx)'],
  ['csv-excel', 'CSV untuk Excel'],
  ['csv-standard', 'CSV standar'],
  ['tsv', 'TSV'],
  ['json', 'JSON'],
] as const;
export type ExportFormatKey = (typeof EXPORT_FORMATS)[number][0];

/** Template bawaan mockup. `period` = preset rentang (today, yday, 30d, mtd). */
export const EXPORT_TEMPLATES: readonly { id: string; label: string; source: ExportDatasetKey; period?: string; agg?: 'day' | 'tot' }[] = [
  { id: 'stop', label: 'Stoptime', source: 'stop', period: '30d' },
  { id: 'daily', label: 'Produksi harian', source: 'line_day', period: 'yday', agg: 'day' },
  { id: 'monthly', label: 'Rekap bulanan per lokasi', source: 'loc_day', period: 'mtd', agg: 'tot' },
  { id: 'shift', label: 'Output per shift', source: 'line_shift', period: 'mtd' },
  { id: 'hourly', label: 'Output per jam', source: 'line_hour', period: 'today' },
  { id: 'quality', label: 'Detail reject', source: 'rej', period: 'mtd' },
  { id: 'products', label: 'Output per produk', source: 'line_product', period: 'mtd' },
  { id: 'executive', label: 'Ringkasan Executive', source: 'exec' },
];

export function exportDefaultColumns(source: ExportDatasetKey): string[] {
  return EXPORT_DATASETS[source].cols.filter((c) => c[2]).map((c) => c[0]);
}
