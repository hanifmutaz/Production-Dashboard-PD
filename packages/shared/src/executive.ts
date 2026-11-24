import { round2 } from './formulas.js';
import { daysInMonth, formatIsoDate, parseIsoDate } from './time.js';

const pad2 = (n: number): string => String(n).padStart(2, '0');

function isoOf(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Default libur = Sabtu & Minggu dalam bulan tsb. */
export function defaultHolidays(year: number, month: number): string[] {
  const out: string[] = [];
  for (let d = 1; d <= daysInMonth(year, month); d += 1) {
    const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (dow === 0 || dow === 6) out.push(isoOf(year, month, d));
  }
  return out;
}

/** Buang tanggal di luar bulan / tidak valid, unik & terurut (aturan simpan kalender lama). */
export function normalizeHolidays(year: number, month: number, dates: readonly string[]): string[] {
  const prefix = `${year}-${pad2(month)}-`;
  const valid = dates.filter((d) => d.startsWith(prefix) && parseIsoDate(d) !== null);
  return [...new Set(valid)].sort();
}

export function workingDays(year: number, month: number, holidays: readonly string[]): number {
  return daysInMonth(year, month) - normalizeHolidays(year, month, holidays).length;
}

/** Hari kerja s/d hari ini (inklusif, WIB). Bulan lampau = semua; bulan depan = 0. */
export function elapsedWorkingDays(year: number, month: number, holidays: readonly string[], todayWIB: Date): number {
  const todayIso = formatIsoDate(todayWIB);
  const off = new Set(normalizeHolidays(year, month, holidays));
  let count = 0;
  for (let d = 1; d <= daysInMonth(year, month); d += 1) {
    const iso = isoOf(year, month, d);
    if (iso > todayIso) break;
    if (!off.has(iso)) count += 1;
  }
  return count;
}

export interface AchievementInput {
  readonly target: number;
  readonly actual: number;
  readonly workingDays: number;
  readonly elapsedWorkingDays: number;
}

export interface Achievement {
  readonly target: number;
  readonly actual: number;
  readonly dailyTarget: number;
  readonly targetHariIni: number;
  readonly gap: number;
  readonly gapHariIni: number;
  readonly achievementPct: number;
  readonly achievementHariIniPct: number;
}

function pct(actual: number, base: number): number {
  return base > 0 ? Math.round((actual / base) * 1000) / 10 : 0;
}

/** Pencapaian per lokasi (LOGIC_SPEC §5). */
export function computeAchievement(input: AchievementInput): Achievement {
  const dailyTarget = input.workingDays > 0 ? input.target / input.workingDays : 0;
  const targetHariIni = round2(dailyTarget * input.elapsedWorkingDays);
  return {
    target: input.target,
    actual: input.actual,
    dailyTarget,
    targetHariIni,
    gap: input.actual - input.target,
    gapHariIni: input.actual - targetHariIni,
    achievementPct: pct(input.actual, input.target),
    achievementHariIniPct: pct(input.actual, targetHariIni),
  };
}

/**
 * Total = JUMLAH nilai per lokasi (bukan dihitung ulang dari masa kerja gabungan).
 * Persen total diturunkan dari jumlah target/actual dengan rumus yang sama.
 */
export function sumAchievements(items: readonly Achievement[]): Achievement {
  const sum = (pick: (a: Achievement) => number): number => items.reduce((acc, a) => acc + pick(a), 0);
  const target = sum((a) => a.target);
  const actual = sum((a) => a.actual);
  const targetHariIni = round2(sum((a) => a.targetHariIni));
  return {
    target,
    actual,
    dailyTarget: sum((a) => a.dailyTarget),
    targetHariIni,
    gap: actual - target,
    gapHariIni: actual - targetHariIni,
    achievementPct: pct(actual, target),
    achievementHariIniPct: pct(actual, targetHariIni),
  };
}

/** Plan harian satu line (monitoring output) = plan bulanan / hari kerja. */
export function dailyPlanFromMonthly(monthlyPlan: number, workDays: number): number {
  return workDays > 0 ? monthlyPlan / workDays : 0;
}
