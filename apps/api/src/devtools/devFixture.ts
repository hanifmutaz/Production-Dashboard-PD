// Fixture sintetis HANYA untuk dev/test (aturan keras #5). Meniru skema kolom view ConMas yang dipakai mapping.
// Mencakup: shift malam lintas tanggal, 25 slot per jam, format shift "Shift N (S Shift)", kolom kosong ('').
import { listReferencedColumns, type ReportColumns } from '../columns/reportColumns.js';

export type FixtureValue = string | number | null;
export type FixtureRow = Record<string, FixtureValue>;

const SQL_TYPE: Readonly<Record<string, string>> = { t: 'text', n: 'numeric', d: 'timestamp without time zone' };

export function fixtureColumns(rc: ReportColumns): { name: string; type: string }[] {
  return listReferencedColumns(rc).map((name) => {
    const suffix = name.startsWith('cluster_') ? name.slice(-1) : '';
    const meta: Readonly<Record<string, string>> = {
      rep_top_id: 'integer',
      rev_no: 'integer',
      public_status: 'numeric',
      sys_update_time: 'timestamp without time zone',
    };
    return { name, type: SQL_TYPE[suffix] ?? meta[name] ?? 'text' };
  });
}

export function fixtureDdl(rc: ReportColumns, table: string): string {
  const cols = fixtureColumns(rc).map((c) => `"${c.name}" ${c.type}`);
  return `CREATE TABLE ${table} (${cols.join(', ')})`;
}

export interface ReportSpec {
  readonly line: string;
  readonly date: string;
  readonly shift: string;
  readonly plan?: number;
  readonly actual?: number;
  readonly rejectM107?: number;
  readonly jamTarget?: number;
  readonly jamEfektif?: number;
  readonly oee?: number | '';
  /** index fisik → [plan, actual]; actual null = belum diisi. */
  readonly hourly?: Readonly<Record<number, readonly [number | null, number | null]>>;
  readonly products?: readonly { readonly cl: string; readonly name: string; readonly mo: string; readonly qty: number }[];
  readonly rejects?: readonly {
    readonly slot: number;
    readonly name: string;
    readonly qty: number;
    readonly kategori?: string;
    readonly masalah?: string;
    readonly minute?: number;
  }[];
  readonly stoptime4m?: {
    readonly man?: number;
    readonly method?: number;
    readonly material?: number;
    readonly machine?: number;
    readonly other?: number;
  };
  readonly repTopId?: number;
  /** null = Line Leader kosong (untuk uji syarat Running). */
  readonly lineLeader?: string | null;
  readonly sogo?: number;
  readonly shugyo?: number;
  readonly kikai?: number;
  readonly updatedAt?: string;
}

export function buildRow(rc: ReportColumns, spec: ReportSpec): FixtureRow {
  const C = rc.COLS;
  const row: FixtureRow = {};
  for (const c of fixtureColumns(rc)) row[c.name] = null;
  row[C.line] = spec.line;
  row[C.tanggal] = `${spec.date} 00:00:00`;
  row[C.shift] = spec.shift;
  row[C.cell_leader] = 'CL Dev';
  row[C.teknisi] = 'Teknisi Dev';
  row[C.inspector] = 'Inspector Dev';
  row[C.line_leader] = spec.lineLeader === undefined ? 'LL Dev' : spec.lineLeader;
  row[C.output_plan] = spec.plan ?? null;
  row[C.output_actual] = spec.actual ?? null;
  row[C.reject_m107] = spec.rejectM107 ?? null;
  row[C.jam_target] = spec.jamTarget ?? null;
  row[C.jam_efektif] = spec.jamEfektif ?? null;
  row[C.oee] = spec.oee === '' ? null : (spec.oee ?? null);
  row[C.rep_top_id] = spec.repTopId ?? null;
  row[C.rev_no] = 1;
  row[C.sogo] = spec.sogo ?? null;
  row[C.shugyo] = spec.shugyo ?? null;
  row[C.kikai] = spec.kikai ?? null;
  row[C.sys_update_time] = spec.updatedAt ?? `${spec.date} 23:00:00`;
  const s4 = spec.stoptime4m ?? {};
  row[C.stoptime_man] = s4.man ?? null;
  row[C.stoptime_method] = s4.method ?? null;
  row[C.stoptime_material] = s4.material ?? null;
  row[C.stoptime_machine] = s4.machine ?? null;
  row[C.stoptime_other] = s4.other ?? null;
  for (const [idx, [plan, actual]] of Object.entries(spec.hourly ?? {})) {
    const pair = rc.HOURLY_COLUMNS[Number(idx)];
    if (!pair) continue;
    row[pair[0]] = plan;
    row[pair[1]] = actual;
  }
  (spec.products ?? []).forEach((p, i) => {
    const slot = rc.PRODUCT_SLOTS[i];
    if (!slot) return;
    row[slot.cl_no] = p.cl;
    row[slot.product_name] = p.name;
    row[slot.mo_no] = p.mo;
    row[slot.qty] = p.qty;
  });
  for (const r of spec.rejects ?? []) {
    const slot = rc.REJECT_PAIRS[r.slot];
    if (!slot) continue;
    row[slot.name] = r.name;
    row[slot.qty] = r.qty;
    row[slot.kategori] = r.kategori ?? null;
    row[slot.masalah] = r.masalah ?? null;
    row[slot.minute] = r.minute ?? null;
  }
  return row;
}

export function insertSql(table: string, row: FixtureRow): { sql: string; params: FixtureValue[] } {
  const keys = Object.keys(row).filter((k) => row[k] !== null);
  return {
    sql: `INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})`,
    params: keys.map((k) => row[k] ?? null),
  };
}

/** Skenario dev standar sebulan untuk 3 line (dipakai seed dev; deterministik). */
export function standardScenario(year: number, month: number, days: number): ReportSpec[] {
  const out: ReportSpec[] = [];
  const pad = (n: number): string => String(n).padStart(2, '0');
  const lines = [
    { line: 'DEV-L01', scheme: 2 },
    { line: 'DEV-L02', scheme: 2 },
    { line: 'DEV-L03', scheme: 3 },
  ];
  for (let d = 1; d <= days; d += 1) {
    const date = `${year}-${pad(month)}-${pad(d)}`;
    const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (dow === 0) continue;
    lines.forEach((l, li) => {
      const shifts = l.scheme === 2 ? [1, 2] : [1, 2, 3];
      for (const s of shifts) {
        const plan = 800 + li * 100;
        const actual = plan - ((d * 7 + s * 13 + li * 5) % 120);
        const hourly: Record<number, [number, number]> = {};
        const startIdx = l.scheme === 2 ? (s === 1 ? 1 : 16) : (s - 1) * 8;
        for (let k = 0; k < 8; k += 1) hourly[startIdx + k] = [100, 100 - ((d + k + s) % 15)];
        out.push({
          line: l.line,
          date,
          shift: `Shift ${s} (${l.scheme} Shift)`,
          plan,
          actual,
          rejectM107: (d + s) % 9,
          jamTarget: 480,
          jamEfektif: 480 - ((d + s) % 4) * 15,
          oee: 70 + ((d * 3 + s) % 25),
          hourly,
          products: [{ cl: `CL-${li}${s}`, name: `PRODUK-DEV-${li + 1}`, mo: `MO-${d}${s}`, qty: plan }],
          rejects: [{ slot: 0, name: 'Burr', qty: (d % 4) + 1, kategori: 'Machine', masalah: 'Setting die', minute: 10 }],
          stoptime4m: { machine: 10, man: 5, material: 0, method: 2, other: 1 },
        });
      }
    });
  }
  return out;
}
