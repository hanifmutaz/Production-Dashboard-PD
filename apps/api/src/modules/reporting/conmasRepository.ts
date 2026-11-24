// Query read-only ke view ConMas. Hanya SELECT; semua nilai input lewat parameter ($n).
import type { ConmasReader } from '../../db/conmas.js';
import type { ColumnKey } from '../../columns/reportColumns.js';
import { placeholders, toNum, toNum0, toText, type ColumnSql } from './columns.js';

const NUMERIC_KEYS = [
  'oee',
  'availability',
  'performance',
  'quality',
  'reject_ppm',
  'output_plan',
  'output_actual',
  'reject_p027',
  'reject_p028',
  'reject_m107',
  'jam_target',
  'jam_efektif',
  'availability_loss',
  'performance_loss',
  'quality_loss',
  'not_oee',
  'sogo',
  'shugyo',
  'kikai',
  'stoptime_man',
  'stoptime_method',
  'stoptime_material',
  'stoptime_machine',
  'stoptime_other',
  'change_point',
] as const satisfies readonly ColumnKey[];

const TEXT_KEYS = ['shift', 'cell_leader', 'teknisi', 'inspector', 'group', 'line_leader'] as const satisfies readonly ColumnKey[];

export type NumericKey = (typeof NUMERIC_KEYS)[number];
export type TextKey = (typeof TEXT_KEYS)[number];

export interface ProductSlotValue {
  readonly cl_no: string | null;
  readonly product_name: string | null;
  readonly mo_no: string | null;
  readonly qty: number | null;
  readonly swi: number | null;
  readonly actual: number | null;
}

export interface DetailRow {
  readonly line: string;
  readonly tanggal: string;
  readonly shift: string | null;
  readonly text: Readonly<Record<TextKey, string | null>>;
  readonly num: Readonly<Record<NumericKey, number | null>>;
  readonly products: readonly ProductSlotValue[];
  /** Per index fisik 0..24. */
  readonly hourly: readonly { readonly plan: number | null; readonly actual: number | null }[];
  readonly repTopId: number | null;
  readonly revNo: number | null;
}

export interface LineDayAggregate {
  readonly line: string;
  readonly date: string;
  readonly rowCount: number;
  readonly plan: number;
  readonly actual: number;
  readonly rejectM107: number;
  readonly jamTarget: number;
  readonly jamEfektif: number;
  /** Σ(OEE × jam_target) untuk report dengan OEE 0–100 dan jam_target > 0 (OQ-004). */
  readonly oeeWeighted: number;
  readonly oeeWeight: number;
  /** Jumlah report dengan OEE di luar 0–100 (OQ-005). */
  readonly oeeAnomaly: number;
  /** SUM kolom TOTAL (OQ-007). */
  readonly sogo: number;
  readonly shugyo: number;
  readonly kikai: number;
  /** Stoptime 4M (menit): Machine, Man, Material, Method, Other. */
  readonly m4: readonly [number, number, number, number, number];
  readonly availabilityLoss: number;
  readonly performanceLoss: number;
  readonly qualityLoss: number;
}

export interface SlotEventRow {
  readonly line: string;
  readonly date: string;
  readonly shift: string | null;
  readonly events: readonly {
    readonly kategori: string | null;
    readonly masalah: string | null;
    readonly minute: number | null;
    readonly qty: number | null;
    readonly name: string | null;
  }[];
}

export class ConmasRepository {
  constructor(
    private readonly reader: ConmasReader,
    private readonly cols: ColumnSql,
  ) {}

  private detailSelect(): string {
    const c = this.cols;
    const C = c.rc.COLS;
    const parts: string[] = [`${c.lineExpr} AS line`, `${c.dateText} AS tanggal`];
    for (const k of TEXT_KEYS) parts.push(`${c.text(C[k])} AS t_${k}`);
    for (const k of NUMERIC_KEYS) parts.push(`${c.num(C[k])} AS n_${k}`);
    parts.push(`${c.num(C.rep_top_id)} AS rep_top_id`, `${c.num(C.rev_no)} AS rev_no`);
    c.rc.PRODUCT_SLOTS.forEach((p, i) => {
      parts.push(
        `${c.text(p.cl_no)} AS p${i}_cl_no`,
        `${c.text(p.product_name)} AS p${i}_product_name`,
        `${c.text(p.mo_no)} AS p${i}_mo_no`,
        `${c.num(p.qty)} AS p${i}_qty`,
        `${c.num(p.swi)} AS p${i}_swi`,
        `${c.num(p.actual)} AS p${i}_actual`,
      );
    });
    c.rc.HOURLY_COLUMNS.forEach(([plan, actual], i) => {
      parts.push(`${c.num(plan)} AS h${i}_plan`, `${c.num(actual)} AS h${i}_actual`);
    });
    return parts.join(',\n  ');
  }

  /** Semua report untuk line & tanggal tertentu (detail line, summary shift berjalan). */
  async fetchDetailRows(lines: readonly string[], dates: readonly string[]): Promise<DetailRow[]> {
    if (lines.length === 0 || dates.length === 0) return [];
    const c = this.cols;
    const sql = `SELECT ${this.detailSelect()}
FROM ${c.view}
WHERE ${c.lineExpr} IN (${placeholders(lines.length)})
  AND ${c.dateText} IN (${placeholders(dates.length, lines.length + 1)})
ORDER BY 1, 2`;
    const { rows } = await this.reader.select(sql, [...lines, ...dates]);
    return rows.map((r) => this.mapDetail(r));
  }

  private mapDetail(r: Record<string, unknown>): DetailRow {
    const text = {} as Record<TextKey, string | null>;
    for (const k of TEXT_KEYS) text[k] = toText(r[`t_${k}`]);
    const num = {} as Record<NumericKey, number | null>;
    for (const k of NUMERIC_KEYS) num[k] = toNum(r[`n_${k}`]);
    const products = this.cols.rc.PRODUCT_SLOTS.map((_, i) => ({
      cl_no: toText(r[`p${i}_cl_no`]),
      product_name: toText(r[`p${i}_product_name`]),
      mo_no: toText(r[`p${i}_mo_no`]),
      qty: toNum(r[`p${i}_qty`]),
      swi: toNum(r[`p${i}_swi`]),
      actual: toNum(r[`p${i}_actual`]),
    }));
    const hourly = this.cols.rc.HOURLY_COLUMNS.map((_, i) => ({
      plan: toNum(r[`h${i}_plan`]),
      actual: toNum(r[`h${i}_actual`]),
    }));
    return {
      line: String(r['line'] ?? ''),
      tanggal: String(r['tanggal'] ?? ''),
      shift: text.shift,
      text,
      num,
      products,
      hourly,
      repTopId: toNum(r['rep_top_id']),
      revNo: toNum(r['rev_no']),
    };
  }

  /** Agregat SUM per line per tanggal (numeric-safe). OEE berbobot jam_target, anomali dihitung terpisah. */
  async aggregateByLineDate(lines: readonly string[], start: string, end: string): Promise<LineDayAggregate[]> {
    if (lines.length === 0) return [];
    const c = this.cols;
    const C = c.rc.COLS;
    const n = lines.length;
    const oee = c.num(C.oee);
    const jt = c.num(C.jam_target);
    const validOee = `${oee} >= 0 AND ${oee} <= 100 AND ${jt} > 0`;
    const sql = `SELECT ${c.lineExpr} AS line, ${c.dateText} AS date, COUNT(*) AS row_count,
  SUM(${c.numAgg(C.output_plan)}) AS plan,
  SUM(${c.numAgg(C.output_actual)}) AS actual,
  SUM(${c.numAgg(C.reject_m107)}) AS reject_m107,
  SUM(${c.numAgg(C.jam_target)}) AS jam_target,
  SUM(${c.numAgg(C.jam_efektif)}) AS jam_efektif,
  SUM(CASE WHEN ${validOee} THEN ${oee} * ${jt} ELSE 0 END) AS oee_weighted,
  SUM(CASE WHEN ${validOee} THEN ${jt} ELSE 0 END) AS oee_weight,
  SUM(CASE WHEN ${oee} < 0 OR ${oee} > 100 THEN 1 ELSE 0 END) AS oee_anomaly,
  SUM(${c.numAgg(C.sogo)}) AS sogo,
  SUM(${c.numAgg(C.shugyo)}) AS shugyo,
  SUM(${c.numAgg(C.kikai)}) AS kikai,
  SUM(${c.numAgg(C.stoptime_machine)}) AS m_machine,
  SUM(${c.numAgg(C.stoptime_man)}) AS m_man,
  SUM(${c.numAgg(C.stoptime_material)}) AS m_material,
  SUM(${c.numAgg(C.stoptime_method)}) AS m_method,
  SUM(${c.numAgg(C.stoptime_other)}) AS m_other,
  SUM(${c.numAgg(C.availability_loss)}) AS l_avail,
  SUM(${c.numAgg(C.performance_loss)}) AS l_perf,
  SUM(${c.numAgg(C.quality_loss)}) AS l_qual
FROM ${c.view}
WHERE ${c.lineExpr} IN (${placeholders(n)})
  AND ${c.dateExpr} BETWEEN $${n + 1}::date AND $${n + 2}::date
GROUP BY ${c.lineExpr}, ${c.dateText}
ORDER BY ${c.lineExpr}, ${c.dateText}`;
    const { rows } = await this.reader.select(sql, [...lines, start, end]);
    return rows.map((r) => ({
      line: String(r['line']),
      date: String(r['date']),
      rowCount: toNum0(r['row_count']),
      plan: toNum0(r['plan']),
      actual: toNum0(r['actual']),
      rejectM107: toNum0(r['reject_m107']),
      jamTarget: toNum0(r['jam_target']),
      jamEfektif: toNum0(r['jam_efektif']),
      oeeWeighted: toNum0(r['oee_weighted']),
      oeeWeight: toNum0(r['oee_weight']),
      oeeAnomaly: toNum0(r['oee_anomaly']),
      sogo: toNum0(r['sogo']),
      shugyo: toNum0(r['shugyo']),
      kikai: toNum0(r['kikai']),
      m4: [toNum0(r['m_machine']), toNum0(r['m_man']), toNum0(r['m_material']), toNum0(r['m_method']), toNum0(r['m_other'])],
      availabilityLoss: toNum0(r['l_avail']),
      performanceLoss: toNum0(r['l_perf']),
      qualityLoss: toNum0(r['l_qual']),
    }));
  }

  /** 150 slot defect/stoptime per report (diagregasi di service). */
  async fetchSlotEvents(lines: readonly string[], start: string, end: string): Promise<SlotEventRow[]> {
    if (lines.length === 0) return [];
    const c = this.cols;
    const n = lines.length;
    const parts = [`${c.lineExpr} AS line`, `${c.dateText} AS date`, `${c.text(c.rc.COLS.shift)} AS shift`];
    c.rc.REJECT_PAIRS.forEach((p, i) => {
      parts.push(
        `${c.text(p.kategori)} AS s${i}_kategori`,
        `${c.text(p.masalah)} AS s${i}_masalah`,
        `${c.num(p.minute)} AS s${i}_minute`,
        `${c.num(p.qty)} AS s${i}_qty`,
        `${c.text(p.name)} AS s${i}_name`,
      );
    });
    const sql = `SELECT ${parts.join(', ')}
FROM ${c.view}
WHERE ${c.lineExpr} IN (${placeholders(n)})
  AND ${c.dateExpr} BETWEEN $${n + 1}::date AND $${n + 2}::date`;
    const { rows } = await this.reader.select(sql, [...lines, start, end]);
    return rows.map((r) => ({
      line: String(r['line']),
      date: String(r['date']),
      shift: toText(r['shift']),
      events: c.rc.REJECT_PAIRS.map((_, i) => ({
        kategori: toText(r[`s${i}_kategori`]),
        masalah: toText(r[`s${i}_masalah`]),
        minute: toNum(r[`s${i}_minute`]),
        qty: toNum(r[`s${i}_qty`]),
        name: toText(r[`s${i}_name`]),
      })),
    }));
  }

  /** Baris terbaru per line (tanpa batas range) untuk produk live di breakdown. */
  async fetchLatestRowPerLine(lines: readonly string[]): Promise<DetailRow[]> {
    if (lines.length === 0) return [];
    const c = this.cols;
    const C = c.rc.COLS;
    const updated = c.ref(C.sys_update_time) ?? 'NULL';
    const sql = `SELECT DISTINCT ON (${c.lineExpr}) ${this.detailSelect()}
FROM ${c.view}
WHERE ${c.lineExpr} IN (${placeholders(lines.length)})
ORDER BY ${c.lineExpr}, ${c.mustRef(C.tanggal)} DESC, ${updated} DESC NULLS LAST`;
    const { rows } = await this.reader.select(sql, [...lines]);
    return rows.map((r) => this.mapDetail(r));
  }

  /** Auto-discovery line registry. */
  async distinctLines(): Promise<string[]> {
    const c = this.cols;
    const sql = `SELECT DISTINCT ${c.lineExpr} AS line FROM ${c.view} WHERE ${c.text(c.rc.COLS.line)} IS NOT NULL ORDER BY 1`;
    const { rows } = await this.reader.select<{ line: string }>(sql);
    return rows.map((r) => r.line);
  }
}
