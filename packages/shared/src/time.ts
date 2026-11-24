// Konvensi waktu (LOGIC_SPEC §2, INV-003):
// "WIB Date" = objek Date yang field UTC-nya berisi jam dinding WIB. Selalu baca dengan getUTC*.
// Ini meniru `new Date(Date.now() + 7*3600*1000)` di dashboard lama.

export const WIB_OFFSET_MS = 7 * 3600 * 1000;
const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toWib(epochMs: number): Date {
  return new Date(epochMs + WIB_OFFSET_MS);
}

export function nowWib(): Date {
  return toWib(Date.now());
}

/** Parse "YYYY-MM-DD" secara UTC eksplisit. Tanggal tidak valid → null (bukan geser hari). */
export function parseIsoDate(value: string): Date | null {
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

export function isIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Format bagian tanggal (UTC field) jadi "YYYY-MM-DD". */
export function formatIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR_MS);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

/** Tengah malam (00:00) dari tanggal di UTC field. */
export function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Jam tertentu pada tanggal ISO, sebagai WIB Date. */
export function atHour(isoDate: string, hour: number): Date {
  const base = parseIsoDate(isoDate);
  if (!base) throw new RangeError(`Tanggal tidak valid: ${isoDate}`);
  return new Date(base.getTime() + hour * HOUR_MS);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Semua tanggal ISO dari start s/d end (inklusif). Iterasi pakai setUTCDate. */
export function eachDate(startIso: string, endIso: string): string[] {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end || start.getTime() > end.getTime()) return [];
  const out: string[] = [];
  for (let d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) out.push(formatIsoDate(d));
  return out;
}

export function diffMinutes(later: Date, earlier: Date): number {
  return (later.getTime() - earlier.getTime()) / 60000;
}

export { DAY_MS, HOUR_MS };
