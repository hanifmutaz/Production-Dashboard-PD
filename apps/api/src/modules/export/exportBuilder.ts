// Pembangun baris ekspor per dataset (port DS mockup) dari data nyata ReportingService/ExecutiveService.
import { deviasi, EXPORT_DATASETS, parseShiftLabel, round1, type ExportDatasetKey } from '@v3/shared';
import type { ExecutiveService } from '../executive/executiveService.js';
import type { ReportingService } from '../reporting/reportingService.js';
import type { Cell } from './exportService.js';

export interface ExportFilters {
  readonly ds: ExportDatasetKey;
  readonly start: string;
  readonly end: string;
  /** Untuk dataset exec: "YYYY-MM". */
  readonly period?: string | undefined;
  readonly locations: readonly string[];
  /** Prefix line dipisah koma/spasi (kosong = semua). */
  readonly lines: string;
  readonly shift: 'all' | '1' | '2' | '3';
  readonly agg: 'day' | 'tot';
}

export type ExportRow = Record<string, Cell>;

const SITE_NAME: Readonly<Record<string, string>> = { internal: 'Hirose Internal', sgp: 'Subcont SGP', systech: 'Subcont Systech' };

export function lineMatcher(filter: string): (code: string) => boolean {
  const prefixes = filter
    .toLowerCase()
    .split(/[,\s;]+/)
    .filter(Boolean);
  return (code) => prefixes.length === 0 || prefixes.some((p) => code.toLowerCase().startsWith(p));
}

function shiftMatches(label: string | null, filter: ExportFilters['shift']): boolean {
  return filter === 'all' || String(parseShiftLabel(label)?.shiftNum ?? '') === filter;
}

const shiftName = (label: string | null): string => {
  const p = parseShiftLabel(label);
  return p ? `Shift ${p.shiftNum}` : (label ?? '—');
};

export async function buildExportRows(f: ExportFilters, reporting: ReportingService, executive: ExecutiveService): Promise<ExportRow[]> {
  const match = lineMatcher(f.lines);
  // Hanya Hirose Internal yang punya sumber data (SGP/Systech On Hold).
  const sites = f.locations.filter((s) => s === 'internal');
  const out: ExportRow[] = [];

  if (f.ds === 'exec') {
    const [y, m] = (f.period ?? f.start.slice(0, 7)).split('-').map(Number);
    const data = await executive.month(y ?? 0, m ?? 0);
    for (const l of data.locations) {
      if (!f.locations.includes(l.tempat) || l.status !== 'ok') continue;
      const running = l.achievement?.targetHariIni ?? null;
      const actual = l.actual;
      out.push({
        period: `${y}-${String(m).padStart(2, '0')}`,
        cutoff: l.daily?.date ?? null,
        day: l.daily?.date ?? null,
        lok: SITE_NAME[l.tempat] ?? l.tempat,
        daily: l.daily?.actual ?? null,
        actual,
        monthly: l.target,
        running,
        runningGap: actual !== null && running !== null ? actual - running : null,
        monthlyGap: actual !== null && l.target !== null ? actual - l.target : null,
        days: l.workingDays,
        runningPct: actual !== null && running ? round1((actual / running) * 100) : null,
        monthlyPct: actual !== null && l.target ? round1((actual / l.target) * 100) : null,
      });
    }
    return out;
  }

  for (const site of sites) {
    const lok = SITE_NAME[site] ?? site;
    if (f.ds === 'loc_day' || f.ds === 'line_day') {
      const { lines, rows } = await reporting.lineMetrics(f.start, f.end, { location: site, perDay: f.agg === 'day' });
      const product = new Map(lines.map((l) => [l.line_code, l.product]));
      const tgl = (d: string | null): string => d ?? `${f.start} s/d ${f.end}`;
      if (f.ds === 'line_day') {
        for (const r of rows.filter((x) => match(x.line) && x.reports > 0)) {
          out.push({
            tgl: tgl(r.date),
            lok,
            line: r.line,
            prod: product.get(r.line) || null,
            pl: r.plan,
            ac: r.actual,
            dev: deviasi(r.plan, r.actual),
            beki: r.bekidoritsu,
            so: r.sogo,
            sh: r.shugyo,
            rej: r.reject,
            ppm: r.reject_ppm,
            st: r.stoptime,
            oee: r.oee,
          });
        }
      } else {
        const keys = [...new Set(rows.filter((r) => r.reports > 0).map((r) => r.date ?? ''))].sort();
        for (const key of keys) {
          const day = rows.filter((r) => (r.date ?? '') === key && r.reports > 0);
          const s = (fn: (r: (typeof day)[number]) => number): number => day.reduce((a, r) => a + fn(r), 0);
          const pl = s((r) => r.plan);
          const ac = s((r) => r.actual);
          const rej = s((r) => r.reject);
          out.push({
            tgl: tgl(key || null),
            lok,
            pl,
            ac,
            beki: pl > 0 ? round1((ac / pl) * 100) : null,
            so: s((r) => r.sogo),
            sh: s((r) => r.shugyo),
            rej,
            ppm: ac + rej > 0 ? Math.round((rej / (ac + rej)) * 1e6) : null,
            st: s((r) => r.stoptime),
            oee: null,
            la: day.length,
          });
        }
      }
    } else if (f.ds === 'line_hour') {
      for (const h of await reporting.hourlyRows(f.start, f.end, site)) {
        if (!match(h.line) || !shiftMatches(h.shift, f.shift)) continue;
        out.push({
          tgl: h.date,
          lok,
          line: h.line,
          shift: shiftName(h.shift),
          jam: h.label,
          pl: h.output_plan,
          ac: h.output_actual,
          dev: h.deviasi,
          pct: h.pencapaian,
        });
      }
    } else if (f.ds === 'line_shift' || f.ds === 'line_product') {
      for (const r of await reporting.reportsForMonth(f.start, f.end, site)) {
        if (!match(r.line) || !shiftMatches(r.shiftLabel, f.shift)) continue;
        const id = { tgl: r.tanggal, lok, line: r.line, shift: shiftName(r.shiftLabel) };
        if (f.ds === 'line_product') {
          for (const [prod, cl, mo, qty] of r.items) out.push({ ...id, cl, prod, mo, qty });
        } else {
          const pl = r.plan;
          const ac = r.actual;
          out.push({
            ...id,
            pl,
            ac,
            dev: pl !== null && ac !== null ? deviasi(pl, ac) : null,
            beki: pl && ac !== null ? round1((ac / pl) * 100) : null,
          });
        }
      }
    } else if (f.ds === 'stop') {
      const { events } = await reporting.stoptimeDetail(f.start, f.end, { location: site });
      for (const e of events) {
        if (!match(e.line) || !shiftMatches(e.shift, f.shift)) continue;
        out.push({
          no: out.length + 1,
          line: e.line,
          shift: shiftName(e.shift),
          kat: e.kategori,
          sebab: e.masalah,
          dur: e.minute,
          tgl: e.date,
          lok,
        });
      }
    } else if (f.ds === 'rej') {
      for (const e of await reporting.rejectEvents(f.start, f.end, { location: site })) {
        if (!match(e.line) || !shiftMatches(e.shift, f.shift)) continue;
        out.push({ tgl: e.date, lok, line: e.line, shift: shiftName(e.shift), defect: e.name, qty: e.qty });
      }
    }
  }
  const order = EXPORT_DATASETS[f.ds].cols.map((c) => c[0]);
  return out.map((r) => Object.fromEntries(order.map((k) => [k, r[k] ?? null])));
}
