// Port SETTINGS_SECTIONS / SETTINGS_GROUPS / SETTINGS_SPEC mockup.
// Field: [key, label, type, optional?, options|min, max]
export type FieldType =
  | 'text'
  | 'email'
  | 'code'
  | 'color'
  | 'enum'
  | 'site'
  | 'line'
  | 'product'
  | 'num'
  | 'int'
  | 'bool'
  | 'month'
  | 'date'
  | 'time'
  | 'password';
export type Field = readonly [string, string, FieldType, boolean?, (readonly (readonly [string, string])[] | number)?, number?];

export const CATEGORIES = ['Machine', 'Man', 'Material', 'Method', 'Other'] as const;

export const SETTINGS_SECTIONS: readonly (readonly [string, string, string, string])[] = [
  ['general', 'Identitas', 'bld', 'Nama dashboard dan departemen.'],
  ['master', 'Master Produksi', 'grid', 'Lokasi, line, mesin dan produk.'],
  ['planning', 'Target Produksi', 'target', 'Plan bulanan per lokasi atau line.'],
  ['kpi', 'KPI & Ambang', 'gauge', 'Ambang status pencapaian, target KPI, dan syarat status line.'],
  ['calendar', 'Shift & Kalender', 'calendar', 'Jam kerja shift dan kalender kerja.'],
  ['loss', 'Downtime & Defect', 'clock', 'Mapping kode penyebab ke 4M dan master defect.'],
  ['source', 'Integrasi i-Reporter', 'db', 'Catatan mapping data ConMas dan pengaturan sinkronisasi.'],
  ['access', 'Pengguna & Akses', 'user', 'Akun, cakupan lokasi, role, dan perangkat kiosk.'],
  ['display', 'Tampilan & Ekspor', 'monitor', 'Default dashboard, kiosk dan format unduhan.'],
  ['alerts', 'Peringatan', 'bell', 'Aturan peringatan untuk output, reject dan stoptime.'],
  ['audit', 'Riwayat & Backup', 'dl', 'Riwayat perubahan serta cadangan konfigurasi.'],
];

export const SETTINGS_GROUPS: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  master: [
    ['locations', 'Lokasi'],
    ['lines', 'Line'],
    ['machines', 'Mesin'],
    ['products', 'Produk'],
  ],
  calendar: [
    ['shifts', 'Shift'],
    ['exceptions', 'Kalender Kerja'],
  ],
  loss: [
    ['causes', 'Penyebab downtime'],
    ['defects', 'Defect'],
  ],
  access: [
    ['users', 'Akun'],
    ['permissions', 'Hak akses'],
    ['customRoles', 'Kelola Role'],
    ['devices', 'Device Management'],
  ],
};

const FORMATS: readonly (readonly [string, string])[] = [
  ['xlsx', 'Excel (.xlsx)'],
  ['csv-excel', 'CSV untuk Excel'],
  ['csv-standard', 'CSV standar'],
  ['tsv', 'TSV'],
  ['json', 'JSON'],
];

export const SPEC: Readonly<Record<string, readonly Field[]>> = {
  general: [
    ['name', 'Nama dashboard', 'text'],
    ['department', 'Departemen', 'text'],
  ],
  lines: [
    ['site', 'Lokasi', 'site'],
    ['code', 'Kode line', 'code'],
    ['name', 'Nama line', 'text', true],
    ['product', 'Produk / series', 'product', true],
    ['external', 'Kode line di ConMas', 'text', true],
    ['cycle', 'Cycle time standar (detik)', 'num', true, 0.01, 99999],
    [
      'scheme',
      'Skema shift',
      'enum',
      false,
      [
        ['2', '2 shift'],
        ['3', '3 shift'],
      ],
    ],
  ],
  machines: [
    ['site', 'Lokasi', 'site'],
    ['line', 'Kode line', 'line'],
    ['code', 'Kode mesin', 'code'],
    ['name', 'Nama mesin', 'text'],
    ['external', 'Kode mesin di ConMas', 'text', true],
  ],
  products: [
    ['code', 'Kode produk / series', 'text'],
    ['name', 'Nama produk', 'text'],
    ['external', 'Kode produk di ConMas', 'text', true],
  ],
  planning: [
    ['site', 'Lokasi', 'site'],
    ['line', 'Level target', 'line', true],
    ['period', 'Bulan target', 'month'],
    ['qty', 'Plan bulanan (pcs)', 'int', false, 0, 1000000000],
    ['days', 'Hari kerja terencana (target line)', 'int', false, 1, 31],
    ['note', 'Keterangan revisi', 'text', true],
  ],
  kpi: [
    ['yellow', 'Kuning mulai (%)', 'num', false, 0, 999],
    ['green', 'Hijau mulai (%)', 'num', false, 1, 1000],
    ['oee', 'Target OEE (%)', 'num', false, 1, 100],
    ['sogo', 'Target Sogo (%) — belum dipakai', 'num', false, 1, 100],
    ['shugyo', 'Target Shugyo (%) — belum dipakai', 'num', false, 1, 100],
    ['ppm', 'Batas reject (PPM)', 'int', false, 1, 1000000],
  ],
  causes: [
    ['code', 'Kode sumber ConMas', 'text'],
    ['name', 'Nama penyebab', 'text'],
    ['category', 'Kategori 4M', 'enum', false, CATEGORIES.map((c) => [c, c] as const)],
    [
      'loss',
      'Jenis loss',
      'enum',
      false,
      [
        ['availability', 'Availability Loss'],
        ['quality', 'Quality Loss'],
        ['performance', 'Performance Loss'],
      ],
    ],
  ],
  defects: [
    ['code', 'Kode defect', 'text'],
    ['name', 'Nama defect', 'text'],
  ],
  source: [
    ['refresh', 'Interval sinkronisasi yang diusulkan (detik)', 'int', false, 10, 3600],
    ['stale', 'Tandai terlambat setelah (menit)', 'int', false, 1, 1440],
    [
      'timezone',
      'Zona waktu produksi',
      'enum',
      false,
      [
        ['Asia/Jakarta', 'WIB · Asia/Jakarta'],
        ['Asia/Makassar', 'WITA · Asia/Makassar'],
        ['Asia/Jayapura', 'WIT · Asia/Jayapura'],
      ],
    ],
    ['line', 'Kolom kode line', 'text', true],
    ['day', 'Kolom tanggal produksi', 'text', true],
    ['shift', 'Kolom shift', 'text', true],
    ['output', 'Kolom actual output', 'text', true],
    ['reject', 'Kolom reject', 'text', true],
    ['category', 'Kolom kategori downtime', 'text', true],
    ['duration', 'Kolom durasi downtime', 'text', true],
    ['remark', 'Kolom remark', 'text', true],
  ],
  users: [
    ['email', 'Email', 'email'],
    ['name', 'Nama akun', 'text'],
    ['role', 'Role', 'enum', false, []],
    ['site', 'Cakupan lokasi (kosong = semua)', 'site', true],
    ['password', 'Password (min. 10 karakter)', 'password', true],
  ],
  display: [
    [
      'home',
      'Halaman awal',
      'enum',
      false,
      [
        ['executive', 'Executive Dashboard'],
        ['hub', 'Master Hub'],
        ['monitoring-output', 'Monitoring Output per Line'],
      ],
    ],
    [
      'theme',
      'Tema default',
      'enum',
      false,
      [
        ['system', 'Ikuti perangkat'],
        ['light', 'Terang'],
        ['dark', 'Gelap'],
      ],
    ],
    [
      'hub',
      'Tab awal Master Hub',
      'enum',
      false,
      [
        ['daily', 'Harian'],
        ['monthly', 'Bulanan'],
      ],
    ],
    ['kioskRefresh', 'Interval refresh kiosk (detik)', 'int', false, 5, 300],
    ['kioskLine', 'Line pertama di kiosk', 'text', true],
    [
      'investigation',
      'Tab awal Detail Investigasi',
      'enum',
      false,
      [
        ['loss', 'Breakdown & Penyebab'],
        ['output', 'Output & Shift'],
      ],
    ],
    ['export', 'Format ekspor default', 'enum', false, FORMATS],
  ],
  alerts: [
    ['name', 'Nama aturan', 'text'],
    [
      'metric',
      'Metrik',
      'enum',
      false,
      [
        ['achievement', 'Pencapaian output (%)'],
        ['reject', 'Reject (PPM)'],
        ['stop', 'Stoptime (menit)'],
      ],
    ],
    ['site', 'Lokasi', 'site', true],
    ['threshold', 'Ambang pemicu', 'num', false, 0, 1000000],
  ],
};

export const DEFAULTS: Readonly<Record<string, Record<string, unknown>>> = {
  general: { name: 'Dashboard Produksi', department: 'Departemen Produksi' },
  kpi: { yellow: 90, green: 100, oee: 85, sogo: 85, shugyo: 85, ppm: 500 },
  source: {
    refresh: 60,
    stale: 15,
    timezone: 'Asia/Jakarta',
    line: '',
    day: '',
    shift: '',
    output: '',
    reject: '',
    category: '',
    duration: '',
    remark: '',
  },
  display: {
    home: 'executive',
    theme: 'system',
    hub: 'daily',
    kioskRefresh: 10,
    kioskLine: '',
    investigation: 'loss',
    export: 'csv-excel',
  },
};

export const LIST_DEFAULT_ROWS: Readonly<Record<string, Record<string, unknown>[]>> = {
  causes: CATEGORIES.map((c) => ({ id: c.toLowerCase(), code: c, name: c, category: c, loss: 'availability', active: true })),
  defects: ['Solder bridge', 'Pin bengkok', 'Short shot', 'Burr', 'Dimensi NG', 'Kontaminasi'].map((name, i) => ({
    id: `defect-${i}`,
    code: name,
    name,
    active: true,
  })),
};

export const MENU_OPTIONS: readonly (readonly [string, string])[] = [
  ['executive', 'Executive Dashboard'],
  ['hub', 'Master Hub'],
  ['master', 'Master Dashboard Lokasi'],
  ['monitoring-output', 'Monitoring Output per Line'],
  ['lines', 'Pilih Line'],
  ['line', 'Line Monitoring'],
  ['stoptime', 'Stoptime'],
  ['export', 'Export Data'],
  ['settings', 'Settings (lihat)'],
];

export interface Check {
  readonly value?: unknown;
  readonly error?: string;
}

/** Port cleanSetting(): validasi satu field. */
export function cleanField(field: Field, value: unknown): Check {
  const [, label, type, optional, opt, max] = field;
  if (type === 'bool') return { value: value === true };
  if (value === '' || value === null || value === undefined) return optional ? { value: '' } : { error: `${label} wajib diisi.` };
  if (type === 'num' || type === 'int') {
    const n = Number(value);
    const min = typeof opt === 'number' ? opt : 0;
    return Number.isFinite(n) && n >= min && n <= (max ?? Infinity) && (type !== 'int' || Number.isInteger(n))
      ? { value: n }
      : { error: `${label} harus antara ${min} dan ${max}.` };
  }
  const s = String(value).trim();
  if (!s) return optional ? { value: '' } : { error: `${label} wajib diisi.` };
  const patterns: Partial<Record<FieldType, RegExp>> = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    code: /^[a-zA-Z0-9._-]{1,60}$/,
    color: /^#[a-f\d]{6}$/i,
    month: /^20\d\d-(0[1-9]|1[0-2])$/,
    date: /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
    time: /^([01]\d|2[0-3]):[0-5]\d$/,
    line: /^[a-zA-Z0-9_-]{1,40}$/,
  };
  const p = patterns[type];
  if (
    (p && !p.test(s)) ||
    (type === 'enum' && Array.isArray(opt) && opt.length && !opt.some(([k]) => k === s)) ||
    s.length > (type === 'email' ? 254 : 130)
  )
    return { error: `${label} tidak valid.` };
  if (type === 'password' && s.length < 10) return { error: `${label.split(' (')[0]} minimal 10 karakter.` };
  return { value: type === 'code' && field[0] !== 'username' ? s.toUpperCase() : s };
}

export function validate(section: string, raw: Record<string, unknown>): { value?: Record<string, unknown>; error?: string } {
  const out: Record<string, unknown> = {};
  for (const f of SPEC[section] ?? []) {
    const c = cleanField(f, raw[f[0]]);
    if (c.error) return { error: c.error };
    out[f[0]] = c.value;
  }
  if (section === 'kpi' && Number(out['yellow']) >= Number(out['green'])) return { error: 'Ambang kuning harus di bawah ambang hijau.' };
  return { value: out };
}
