// Logika reporting (LOGIC_SPEC §2, §4, §7, §8 + keputusan OPEN_QUESTIONS 2026-11-25).
// Rumus diambil dari @v3/shared — tidak ditulis ulang di sini.
import {
  addDays,
  bekidoritsu,
  deviasi,
  eachDate,
  elapsedSince,
  formatIsoDate,
  getLineStatus3,
  getShiftSlots,
  hourlyAchievement,
  hourlyDeviasi,
  isPercentAnomaly,
  isRowStale,
  missingRunningFields,
  oeeFromWeightedSums,
  operatorAvailability,
  parseShiftLabel,
  pickActiveRow,
  rejectPpm,
  resolveShiftAndDate,
  shiftWindowFromLabel,
  slotLabel,
  startOfDay,
  stoptimeTotal,
  toWib,
  weightedOee,
  type BreakdownLine,
  type HourlyPoint,
  type LineDetail,
  type LineStatus,
  type LineStatusSettings,
  type RangeTrend,
  type RejectItem,
  type RunningField,
  type ShiftConfig,
  type SummaryTotals,
  type TrendDay,
} from '@v3/shared';
import { notFound } from '../../http/errors.js';
import type { LineRecord, LinesRepository } from '../masterData/linesRepository.js';
import type { SettingsService } from '../settings/settingsService.js';
import type { ConmasRepository, DetailRow, LineDayAggregate, ProductSlotValue } from './conmasRepository.js';

export type Clock = () => number;

export interface LineDetailResult {
  readonly data: LineDetail | null;
  readonly line_status: LineStatus;
  readonly shift: string | null;
  readonly tanggal: string | null;
  readonly available_shifts: readonly string[];
}

/** Produk aktif = slot terakhir yang cl_no-nya terisi (LOGIC_SPEC §3). */
export function activeProduct(products: readonly ProductSlotValue[]): ProductSlotValue | null {
  for (let i = products.length - 1; i >= 0; i -= 1) {
    const p = products[i];
    if (p?.cl_no) return p;
  }
  return null;
}

/** Field syarat Running yang terisi pada satu report. Angka 0 = terisi; kosong = belum. */
export function filledRunningFields(row: DetailRow): Set<RunningField> {
  const filled = new Set<RunningField>();
  if (row.products.some((p) => p.cl_no !== null)) filled.add('cl_no');
  if (row.text.line_leader !== null) filled.add('line_leader');
  if (row.text.cell_leader !== null) filled.add('cell_leader');
  if (row.text.teknisi !== null) filled.add('teknisi');
  if (row.text.inspector !== null) filled.add('inspector');
  if (row.num.output_plan !== null) filled.add('output_plan');
  if (row.num.output_actual !== null) filled.add('output_actual');
  return filled;
}

function nullableStoptime(target: number | null, efektif: number | null): number | null {
  if (target === null && efektif === null) return null;
  return stoptimeTotal(target ?? 0, efektif ?? 0);
}

export class ReportingService {
  constructor(
    private readonly conmas: ConmasRepository,
    private readonly lines: LinesRepository,
    private readonly cfg: ShiftConfig,
    private readonly settings: SettingsService,
    private readonly clock: Clock = Date.now,
  ) {}

  private nowWib(): Date {
    return toWib(this.clock());
  }

  private async requireLine(lineCode: string): Promise<LineRecord> {
    const line = await this.lines.find(lineCode);
    if (!line || !line.active) throw notFound(`Line ${lineCode} tidak terdaftar atau tidak aktif`);
    return line;
  }

  buildHourly(row: DetailRow): HourlyPoint[] {
    const parsed = parseShiftLabel(row.shift);
    const slots = parsed
      ? getShiftSlots(row.tanggal, parsed.scheme, parsed.shiftNum, this.cfg)
      : row.hourly.map((_, index) => ({ index, label: slotLabel(index, this.cfg.hourlySlotOffset) }));
    return slots.map(({ index, label }) => {
      const h = row.hourly[index];
      const plan = h?.plan ?? null;
      const actual = h?.actual ?? null;
      return {
        slot: index,
        label,
        output_plan: plan,
        output_actual: actual,
        deviasi: hourlyDeviasi(plan, actual),
        pencapaian: hourlyAchievement(plan, actual),
      };
    });
  }

  private isStale(row: DetailRow, now: Date, thresholdMin: number): boolean {
    const parsed = parseShiftLabel(row.shift);
    if (!parsed) return false;
    const window = shiftWindowFromLabel(row.tanggal, parsed.scheme, parsed.shiftNum, this.cfg);
    if (!window) return false;
    return isRowStale({
      hourlyActual: row.hourly.map((h) => h.actual),
      reportDate: row.tanggal,
      shiftStartWIB: window.startWIB,
      nowWIB: now,
      thresholdMin,
      hourlySlotOffset: this.cfg.hourlySlotOffset,
    });
  }

  /** Satu fungsi status untuk detail line & ringkasan (OQ-011/012). */
  private liveStatus(
    row: DetailRow | null,
    shiftStartWIB: Date,
    now: Date,
    rules: LineStatusSettings,
    applyStale: boolean,
  ): { status: LineStatus; missing: RunningField[] } {
    const missing = row ? missingRunningFields(filledRunningFields(row), rules.requiredFields) : [];
    const status = getLineStatus3({
      hasRow: row !== null,
      complete: missing.length === 0,
      stale: row !== null && applyStale && rules.staleEnabled ? this.isStale(row, now, rules.staleThresholdMin) : false,
      elapsedMin: elapsedSince(shiftStartWIB, now),
      graceMin: this.cfg.lineStartGraceMin,
      historical: false,
      shiftRequested: false,
    });
    return { status, missing };
  }

  toLineDetail(
    row: DetailRow,
    status: LineStatus,
    historical: boolean,
    availableShifts: readonly string[],
    missing: readonly RunningField[],
  ): LineDetail {
    const n = row.num;
    const product = activeProduct(row.products);
    const plan = n.output_plan;
    const actual = n.output_actual;
    return {
      line: row.line,
      shift: row.shift,
      tanggal: row.tanggal,
      line_status: status,
      line_not_running: status === 'not_running',
      cell_leader_nama: row.text.cell_leader,
      pj_teknis_nama: row.text.teknisi,
      inspector_nama: row.text.inspector,
      product_name: product?.product_name ?? null,
      cl_no: product?.cl_no ?? null,
      cycle_time_swi: product?.swi ?? null,
      cycle_time_actual: product?.actual ?? null,
      output_plan: plan,
      output_total: actual,
      deviasi_target: plan !== null && actual !== null ? deviasi(plan, actual) : null,
      reject_qty: n.reject_m107,
      qty_reject_ppm: n.reject_ppm,
      stoptime_total: nullableStoptime(n.jam_target, n.jam_efektif),
      stoptime_man: n.stoptime_man,
      stoptime_machine: n.stoptime_machine,
      stoptime_material: n.stoptime_material,
      stoptime_method: n.stoptime_method,
      stoptime_other: n.stoptime_other,
      availability_operator: operatorAvailability(actual, n.reject_m107, plan),
      hourly: this.buildHourly(row),
      missing_fields: missing,
      historical,
      available_shifts: availableShifts,
    };
  }

  /** Detail line: live (hari ini + kemarin) atau historis (?date, ?shift). */
  async lineDetail(input: { line: string; date?: string | undefined; shift?: number | undefined }): Promise<LineDetailResult> {
    const line = await this.requireLine(input.line);
    const rules = await this.settings.lineStatus();
    if (input.date !== undefined) {
      const rows = await this.conmas.fetchDetailRows([line.line_code], [input.date]);
      const historicalNow = new Date(`${input.date}T23:59:00Z`);
      const picked = pickActiveRow(rows, historicalNow, this.cfg, { exactDate: input.date, shiftOverride: input.shift });
      const shifts = [...new Set(rows.map((r) => r.shift).filter((s): s is string => s !== null))].sort();
      const missing = picked ? missingRunningFields(filledRunningFields(picked), rules.requiredFields) : [];
      const status = getLineStatus3({
        hasRow: picked !== null,
        complete: missing.length === 0,
        stale: false,
        elapsedMin: 0,
        graceMin: this.cfg.lineStartGraceMin,
        historical: true,
        shiftRequested: input.shift !== undefined,
      });
      return {
        data: picked ? this.toLineDetail(picked, status, true, shifts, missing) : null,
        line_status: status,
        shift: picked?.shift ?? null,
        tanggal: input.date,
        available_shifts: shifts,
      };
    }

    const now = this.nowWib();
    const today = formatIsoDate(now);
    const yesterday = formatIsoDate(addDays(startOfDay(now), -1));
    const rows = await this.conmas.fetchDetailRows([line.line_code], [yesterday, today]);
    const picked = pickActiveRow(rows, now, this.cfg);
    const resolved = resolveShiftAndDate(now, line.shift_scheme, this.cfg);
    const { status, missing } = this.liveStatus(picked, resolved.shiftStartWIB, now, rules, true);
    const tanggal = picked?.tanggal ?? resolved.tanggal;
    const shifts = [
      ...new Set(
        rows
          .filter((r) => r.tanggal === tanggal)
          .map((r) => r.shift)
          .filter((s): s is string => s !== null),
      ),
    ].sort();
    return {
      data: picked ? this.toLineDetail(picked, status, false, shifts, missing) : null,
      line_status: status,
      shift: picked?.shift ?? resolved.shift,
      tanggal,
      available_shifts: shifts,
    };
  }

  /** Ringkasan shift berjalan semua line aktif. Angka output dijumlah dari semua report shift aktif. */
  async currentShiftSummary(
    location?: string,
  ): Promise<SummaryTotals & { lines: { line: string; status: LineStatus; missing_fields: RunningField[] }[] }> {
    const activeLines = await this.lines.listActive(location);
    const rules = await this.settings.lineStatus();
    const now = this.nowWib();
    const today = formatIsoDate(now);
    const yesterday = formatIsoDate(addDays(startOfDay(now), -1));
    const rows = await this.conmas.fetchDetailRows(
      activeLines.map((l) => l.line_code),
      [yesterday, today],
    );
    let plan = 0;
    let actual = 0;
    let reject = 0;
    let stoptime = 0;
    let sogo = 0;
    let shugyo = 0;
    let kikai = 0;
    const oeeItems: { oee: number | null; weight: number | null }[] = [];
    const counts: Record<LineStatus, number> = { running: 0, waiting: 0, not_running: 0, no_data: 0, shift_not_found: 0 };
    const perLine: { line: string; status: LineStatus; missing_fields: RunningField[] }[] = [];
    for (const line of activeLines) {
      const resolved = resolveShiftAndDate(now, line.shift_scheme, this.cfg);
      const mine = rows.filter((r) => {
        const p = parseShiftLabel(r.shift);
        return (
          r.line === line.line_code && r.tanggal === resolved.tanggal && p?.shiftNum === resolved.shiftNum && p.scheme === line.shift_scheme
        );
      });
      // Bila ada >1 report di shift yang sama, status memakai report yang lengkap (kalau ada).
      const best = mine.find((r) => missingRunningFields(filledRunningFields(r), rules.requiredFields).length === 0) ?? mine[0] ?? null;
      const { status, missing } = this.liveStatus(best, resolved.shiftStartWIB, now, rules, rules.staleInSummary);
      counts[status] += 1;
      perLine.push({ line: line.line_code, status, missing_fields: missing });
      for (const r of mine) {
        plan += r.num.output_plan ?? 0;
        actual += r.num.output_actual ?? 0;
        reject += r.num.reject_m107 ?? 0;
        stoptime += stoptimeTotal(r.num.jam_target ?? 0, r.num.jam_efektif ?? 0);
        sogo += r.num.sogo ?? 0;
        shugyo += r.num.shugyo ?? 0;
        kikai += r.num.kikai ?? 0;
        oeeItems.push({ oee: r.num.oee, weight: r.num.jam_target });
      }
    }
    const oee = weightedOee(oeeItems);
    return {
      lines_total: activeLines.length,
      lines_running: counts.running,
      lines_waiting: counts.waiting,
      lines_not_running: counts.not_running,
      output_plan: plan,
      output_actual: actual,
      qty_reject: reject,
      reject_ppm: rejectPpm(reject, actual),
      stoptime_total: stoptime,
      oee: oee.value,
      oee_anomaly_count: oee.anomalies,
      sogo,
      shugyo,
      kikai,
      lines: perLine,
    };
  }

  private async aggregates(start: string, end: string, location?: string): Promise<{ lines: LineRecord[]; agg: LineDayAggregate[] }> {
    const lines = await this.lines.listActive(location);
    const agg = await this.conmas.aggregateByLineDate(
      lines.map((l) => l.line_code),
      start,
      end,
    );
    return { lines, agg };
  }

  /** Ringkasan SUM untuk rentang tanggal (daily = start=end, monthly = sebulan). */
  async rangeSummary(start: string, end: string, location?: string): Promise<SummaryTotals & { hasData: boolean }> {
    const { lines, agg } = await this.aggregates(start, end, location);
    const sum = (pick: (a: LineDayAggregate) => number): number => agg.reduce((acc, a) => acc + pick(a), 0);
    const withData = new Set(agg.map((a) => a.line));
    const today = formatIsoDate(this.nowWib());
    // Line tanpa report hanya relevan untuk hari ini (LOGIC_SPEC §4)
    let notRunning = 0;
    let waiting = 0;
    if (start === end && start === today) {
      const now = this.nowWib();
      for (const l of lines) {
        if (withData.has(l.line_code)) continue;
        const resolved = resolveShiftAndDate(now, l.shift_scheme, this.cfg);
        if (elapsedSince(resolved.shiftStartWIB, now) > this.cfg.lineStartGraceMin) notRunning += 1;
        else waiting += 1;
      }
    }
    const actual = sum((a) => a.actual);
    const reject = sum((a) => a.rejectM107);
    return {
      lines_total: lines.length,
      lines_running: withData.size,
      lines_waiting: waiting,
      lines_not_running: notRunning,
      output_plan: sum((a) => a.plan),
      output_actual: actual,
      qty_reject: reject,
      reject_ppm: rejectPpm(reject, actual),
      stoptime_total: stoptimeTotal(
        sum((a) => a.jamTarget),
        sum((a) => a.jamEfektif),
      ),
      oee: oeeFromWeightedSums(
        sum((a) => a.oeeWeighted),
        sum((a) => a.oeeWeight),
      ),
      oee_anomaly_count: sum((a) => a.oeeAnomaly),
      sogo: sum((a) => a.sogo),
      shugyo: sum((a) => a.shugyo),
      kikai: sum((a) => a.kikai),
      hasData: agg.length > 0,
    };
  }

  /** Trend harian dalam rentang; hari tanpa data → hasData=false (bukan 0 palsu). */
  async rangeTrend(start: string, end: string, opts: { location?: string; line?: string } = {}): Promise<RangeTrend> {
    let agg: LineDayAggregate[];
    if (opts.line) {
      const line = await this.requireLine(opts.line);
      agg = await this.conmas.aggregateByLineDate([line.line_code], start, end);
    } else {
      agg = (await this.aggregates(start, end, opts.location)).agg;
    }
    const today = formatIsoDate(this.nowWib());
    const byDate = new Map<string, { plan: number; actual: number; jt: number; je: number; rows: number }>();
    for (const a of agg) {
      const cur = byDate.get(a.date) ?? { plan: 0, actual: 0, jt: 0, je: 0, rows: 0 };
      cur.plan += a.plan;
      cur.actual += a.actual;
      cur.jt += a.jamTarget;
      cur.je += a.jamEfektif;
      cur.rows += a.rowCount;
      byDate.set(a.date, cur);
    }
    const days: TrendDay[] = eachDate(start, end).map((date) => {
      const d = byDate.get(date);
      const future = date > today;
      return {
        date,
        plan: d?.plan ?? 0,
        actual: d?.actual ?? 0,
        stoptime: d ? stoptimeTotal(d.jt, d.je) : 0,
        hasData: !future && d !== undefined && d.rows > 0,
      };
    });
    const plan = days.reduce((acc, d) => acc + d.plan, 0);
    const actual = days.reduce((acc, d) => acc + d.actual, 0);
    const jt = [...byDate.values()].reduce((acc, d) => acc + d.jt, 0);
    const je = [...byDate.values()].reduce((acc, d) => acc + d.je, 0);
    return { days, totals: { plan, actual, bekidoritsu: bekidoritsu(actual, plan), stoptime: stoptimeTotal(jt, je) } };
  }

  /** Breakdown per line untuk rentang bebas (LOGIC_SPEC §8). */
  async lineRangeBreakdown(start: string, end: string, location?: string): Promise<{ dates: string[]; lines: BreakdownLine[] }> {
    const { lines, agg } = await this.aggregates(start, end, location);
    const dates = eachDate(start, end);
    const today = formatIsoDate(this.nowWib());
    // Kegagalan lookup produk → null ("—"), tidak menggagalkan tabel (LOGIC_SPEC §8).
    const latest: DetailRow[] = await this.conmas.fetchLatestRowPerLine(lines.map((l) => l.line_code)).catch(() => []);
    const productByLine = new Map(latest.map((r) => [r.line, activeProduct(r.products)?.product_name ?? null]));
    const out: BreakdownLine[] = lines.map((l) => {
      const mine = agg.filter((a) => a.line === l.line_code);
      const byDate = new Map(mine.map((a) => [a.date, a]));
      const plan = mine.reduce((acc, a) => acc + a.plan, 0);
      const actual = mine.reduce((acc, a) => acc + a.actual, 0);
      const reject = mine.reduce((acc, a) => acc + a.rejectM107, 0);
      return {
        line_code: l.line_code,
        product_name: productByLine.get(l.line_code) ?? null,
        tempat: l.location,
        output_plan: plan,
        output_actual: actual,
        qty_reject: reject,
        reject_ppm: rejectPpm(reject, actual),
        bekidoritsu: bekidoritsu(actual, plan),
        deviasi: deviasi(plan, actual),
        days: dates.map((date) => {
          const a = byDate.get(date);
          return { date, plan: a?.plan ?? 0, actual: a?.actual ?? 0, hasData: date <= today && a !== undefined && a.rowCount > 0 };
        }),
      };
    });
    return { dates, lines: out };
  }

  /** Detail reject: agregasi 150 slot (nama defect + qty M107), urut terbesar. Slot kosong difilter. */
  async rejectDetail(start: string, end: string, opts: { line?: string; location?: string } = {}): Promise<RejectItem[]> {
    const lineCodes = opts.line
      ? [(await this.requireLine(opts.line)).line_code]
      : (await this.lines.listActive(opts.location)).map((l) => l.line_code);
    const rows = await this.conmas.fetchSlotEvents(lineCodes, start, end);
    const totals = new Map<string, number>();
    for (const r of rows) {
      for (const e of r.events) {
        if (!e.name || e.qty === null) continue;
        totals.set(e.name, (totals.get(e.name) ?? 0) + e.qty);
      }
    }
    return [...totals.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  }

  /** Detail stoptime per kejadian (kategori 4M + masalah + menit). */
  async stoptimeDetail(start: string, end: string, opts: { line?: string; location?: string } = {}) {
    const lineCodes = opts.line
      ? [(await this.requireLine(opts.line)).line_code]
      : (await this.lines.listActive(opts.location)).map((l) => l.line_code);
    const rows = await this.conmas.fetchSlotEvents(lineCodes, start, end);
    const events = rows.flatMap((r) =>
      r.events
        .filter((e) => e.kategori !== null || e.masalah !== null || e.minute !== null)
        .map((e) => ({ line: r.line, date: r.date, kategori: e.kategori, masalah: e.masalah, minute: e.minute })),
    );
    const byCategory = new Map<string, number>();
    for (const e of events) {
      const key = e.kategori ?? 'Tanpa kategori';
      byCategory.set(key, (byCategory.get(key) ?? 0) + (e.minute ?? 0));
    }
    return {
      events,
      byCategory: [...byCategory.entries()].map(([kategori, minute]) => ({ kategori, minute })).sort((a, b) => b.minute - a.minute),
    };
  }

  /** Report mentah per line per hari dalam bentuk SOURCE_BOOK.reports mockup (diperluas). */
  async reportsForMonth(start: string, end: string, location?: string) {
    const lines = await this.lines.listActive(location);
    const dates = eachDate(start, end);
    const rows = await this.conmas.fetchDetailRows(
      lines.map((l) => l.line_code),
      dates,
    );
    return rows.map((r, i) => {
      const p = parseShiftLabel(r.shift);
      const pct = [r.num.oee, r.num.availability, r.num.performance, r.num.quality];
      return {
        row: i + 1,
        line: r.line,
        tanggal: r.tanggal,
        shift: p?.shiftNum ?? null,
        shiftLabel: r.shift,
        actual: r.num.output_actual,
        plan: r.num.output_plan,
        // OQ-005: skala 0–100 (terverifikasi dari DB). Nilai di luar 0–100 ditandai anomali, tidak di-clamp.
        availability: r.num.availability,
        performance: r.num.performance,
        quality: r.num.quality,
        oee: r.num.oee,
        anomaly: pct.some((v) => isPercentAnomaly(v)),
        // Urutan kategori mengikuti mockup: Machine, Man, Material, Method, Other (menit)
        categories: [r.num.stoptime_machine, r.num.stoptime_man, r.num.stoptime_material, r.num.stoptime_method, r.num.stoptime_other],
        change: r.num.change_point,
        reject_m107: r.num.reject_m107,
        reject_ppm: r.num.reject_ppm,
        sogo: r.num.sogo,
        shugyo: r.num.shugyo,
        kikai: r.num.kikai,
        items: r.products.filter((x) => x.cl_no).map((x) => [x.product_name, x.cl_no, x.mo_no, x.qty] as const),
      };
    });
  }
}
