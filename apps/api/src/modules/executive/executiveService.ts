// Executive (LOGIC_SPEC §5). Actual internal = output_actual bulanan dari sumber yang sama dengan Master Hub.
// SGP/Systech = on_hold selama SUBCONT_ENABLED=false: tanpa request keluar dan tanpa angka 0 palsu.
import {
  computeAchievement,
  daysInMonth,
  defaultHolidays,
  elapsedWorkingDays,
  normalizeHolidays,
  sumAchievements,
  toWib,
  workingDays,
  type Achievement,
  type SourceStatus,
  type Tempat,
  TEMPAT_LIST,
} from '@v3/shared';
import type { Queryable } from '../../db/pool.js';
import type { ReportingService } from '../reporting/reportingService.js';

const pad2 = (n: number): string => String(n).padStart(2, '0');

export interface LocationAchievement {
  readonly tempat: Tempat;
  readonly status: SourceStatus;
  readonly target: number | null;
  readonly targetVersion: number | null;
  readonly workingDays: number;
  readonly elapsedWorkingDays: number;
  readonly holidays: readonly string[];
  readonly calendarVersion: number | null;
  readonly achievement: Achievement | null;
}

export class ExecutiveService {
  private readonly cache = new Map<string, { at: number; value: number }>();

  constructor(
    private readonly db: Queryable,
    private readonly reporting: ReportingService,
    private readonly opts: { subcontEnabled: boolean; cacheSec: number; clock?: () => number },
  ) {}

  private now(): number {
    return (this.opts.clock ?? Date.now)();
  }

  statusOf(tempat: Tempat): SourceStatus {
    if (tempat === 'internal') return 'ok';
    // Push-sync snapshot belum dipakai di tahap ini (Fase Subcont HOLD).
    return this.opts.subcontEnabled ? 'unavailable' : 'on_hold';
  }

  async getCalendar(tempat: Tempat, year: number, month: number): Promise<{ holidays: string[]; version: number | null }> {
    const { rows } = await this.db.query(
      `SELECT holidays, version FROM calendar_exceptions WHERE location = $1 AND year = $2 AND month = $3`,
      [tempat, year, month],
    );
    const r = rows[0];
    if (!r) return { holidays: defaultHolidays(year, month), version: null };
    const raw = Array.isArray(r['holidays']) ? (r['holidays'] as unknown[]).map(String) : [];
    return { holidays: normalizeHolidays(year, month, raw), version: Number(r['version']) };
  }

  async getTarget(tempat: Tempat, year: number, month: number): Promise<{ target: number; version: number } | null> {
    const { rows } = await this.db.query(`SELECT target, version FROM targets WHERE location = $1 AND year = $2 AND month = $3`, [
      tempat,
      year,
      month,
    ]);
    const r = rows[0];
    return r ? { target: Number(r['target']), version: Number(r['version']) } : null;
  }

  /** Actual bulanan internal dengan cache singkat (default 30 detik, sama dengan dashboard lama). */
  async monthlyActual(year: number, month: number): Promise<number> {
    const key = `${year}-${month}`;
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < this.opts.cacheSec * 1000) return hit.value;
    const start = `${year}-${pad2(month)}-01`;
    const end = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`;
    const summary = await this.reporting.rangeSummary(start, end, 'internal');
    this.cache.set(key, { at: this.now(), value: summary.output_actual });
    return summary.output_actual;
  }

  async month(year: number, month: number) {
    const today = toWib(this.now());
    const locations: LocationAchievement[] = [];
    for (const tempat of TEMPAT_LIST) {
      const status = this.statusOf(tempat);
      const cal = await this.getCalendar(tempat, year, month);
      const target = await this.getTarget(tempat, year, month);
      const wd = workingDays(year, month, cal.holidays);
      const ewd = elapsedWorkingDays(year, month, cal.holidays, today);
      let achievement: Achievement | null = null;
      if (status === 'ok' && target) {
        const actual = await this.monthlyActual(year, month);
        achievement = computeAchievement({ target: target.target, actual, workingDays: wd, elapsedWorkingDays: ewd });
      }
      locations.push({
        tempat,
        status,
        target: target?.target ?? null,
        targetVersion: target?.version ?? null,
        workingDays: wd,
        elapsedWorkingDays: ewd,
        holidays: cal.holidays,
        calendarVersion: cal.version,
        achievement,
      });
    }
    const available = locations.flatMap((l) => (l.achievement ? [l.achievement] : []));
    return {
      year,
      month,
      locations,
      // Total = jumlah lokasi yang datanya tersedia; lokasi On Hold tidak dihitung sebagai 0.
      total: available.length > 0 ? sumAchievements(available) : null,
      totalIncludes: locations.filter((l) => l.achievement).map((l) => l.tempat),
    };
  }

  /** Kumulatif target vs actual per bulan sepanjang tahun. */
  async trend(year: number, tempat?: Tempat) {
    const targets = tempat ? [tempat] : TEMPAT_LIST.filter((t) => this.statusOf(t) === 'ok');
    const months = [];
    let cumTarget = 0;
    let cumActual = 0;
    const currentYm = toWib(this.now());
    for (let m = 1; m <= 12; m += 1) {
      let target = 0;
      let actual: number | null = 0;
      for (const t of targets) {
        if (this.statusOf(t) !== 'ok') {
          actual = null;
          continue;
        }
        target += (await this.getTarget(t, year, m))?.target ?? 0;
        const future = year > currentYm.getUTCFullYear() || (year === currentYm.getUTCFullYear() && m > currentYm.getUTCMonth() + 1);
        if (!future && actual !== null) actual += await this.monthlyActual(year, m);
        if (future) actual = null;
      }
      cumTarget += target;
      if (actual !== null) cumActual += actual;
      months.push({ month: m, target, actual, cumTarget, cumActual: actual === null ? null : cumActual });
    }
    return { year, tempat: tempat ?? 'all', status: tempat ? this.statusOf(tempat) : 'ok', months };
  }

  static validHolidays(year: number, month: number, dates: readonly string[]): string[] {
    return normalizeHolidays(year, month, dates);
  }
}

export function isTempat(value: string): value is Tempat {
  return (TEMPAT_LIST as readonly string[]).includes(value);
}
