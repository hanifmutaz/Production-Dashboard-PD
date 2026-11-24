import { HOURLY_BASE_START_HOUR, HOURLY_SLOT_COUNT, type ShiftConfig, type ShiftScheme } from './config.js';
import { addDays, addHours, atHour, diffMinutes, formatIsoDate, HOUR_MS, parseIsoDate, startOfDay } from './time.js';

const SHIFT_RE = /Shift\s*(\d)\s*\((\d)\s*Shift\)/i;
const FRIDAY = 5;

export interface ParsedShift {
  readonly shiftNum: number;
  readonly scheme: ShiftScheme;
}

/** "Shift 2 (3 Shift)" → {shiftNum:2, scheme:3}. Teks rusak/kosong/skema tak dikenal → null. */
export function parseShiftLabel(text: string | null | undefined): ParsedShift | null {
  if (!text) return null;
  const m = SHIFT_RE.exec(text);
  if (!m) return null;
  const shiftNum = Number(m[1]);
  const scheme = Number(m[2]);
  if (scheme !== 2 && scheme !== 3) return null;
  if (shiftNum < 1 || shiftNum > scheme) return null;
  return { shiftNum, scheme };
}

export function formatShiftLabel(shiftNum: number, scheme: ShiftScheme): string {
  return `Shift ${shiftNum} (${scheme} Shift)`;
}

export interface ShiftWindow {
  readonly startWIB: Date;
  readonly endWIB: Date;
}

function shift2DayEndHour(isoDate: string, cfg: ShiftConfig): number {
  const d = parseIsoDate(isoDate);
  return d && d.getUTCDay() === FRIDAY ? cfg.shift2EndHourFriday : cfg.shift2EndHourWeekday;
}

/** Jendela shift dari tanggal kalender baris + label. Shift lintas hari berakhir di hari berikutnya. */
export function shiftWindowFromLabel(calendarDate: string, scheme: ShiftScheme, shiftNum: number, cfg: ShiftConfig): ShiftWindow | null {
  if (!parseIsoDate(calendarDate)) return null;
  const nextDay = formatIsoDate(addDays(atHour(calendarDate, 0), 1));
  if (scheme === 2) {
    if (shiftNum === 1) {
      return {
        startWIB: atHour(calendarDate, cfg.shift2StartHour),
        endWIB: atHour(calendarDate, shift2DayEndHour(calendarDate, cfg)),
      };
    }
    if (shiftNum === 2) {
      return { startWIB: atHour(calendarDate, cfg.shift2NightStartHour), endWIB: atHour(nextDay, cfg.shift2StartHour) };
    }
    return null;
  }
  if (shiftNum === 1) {
    return { startWIB: atHour(calendarDate, cfg.shift3StartHour), endWIB: atHour(calendarDate, cfg.shift3SecondStartHour) };
  }
  if (shiftNum === 2) {
    return {
      startWIB: atHour(calendarDate, cfg.shift3SecondStartHour),
      endWIB: atHour(calendarDate, cfg.shift3ThirdStartHour),
    };
  }
  if (shiftNum === 3) {
    return { startWIB: atHour(calendarDate, cfg.shift3ThirdStartHour), endWIB: atHour(nextDay, cfg.shift3StartHour) };
  }
  return null;
}

export interface ResolvedShift {
  readonly shift: string;
  readonly shiftNum: number;
  readonly scheme: ShiftScheme;
  readonly tanggal: string;
  readonly shiftStartWIB: Date;
}

/**
 * Shift yang berlaku pada `nowWIB`. Shift malam yang lewat tengah malam dicatat di tanggal kemarin
 * (useYesterday). Celah 2-shift (akhir Shift 1 s/d mulai Shift 2) → Shift 1 yang baru selesai.
 */
export function resolveShiftAndDate(nowWIB: Date, scheme: ShiftScheme, cfg: ShiftConfig): ResolvedShift {
  const hour = nowWIB.getUTCHours();
  const today = formatIsoDate(nowWIB);
  const yesterday = formatIsoDate(addDays(startOfDay(nowWIB), -1));
  const morningStart = scheme === 2 ? cfg.shift2StartHour : cfg.shift3StartHour;
  const useYesterday = hour < morningStart;

  let shiftNum: number;
  let tanggal: string;
  if (scheme === 2) {
    if (useYesterday) {
      shiftNum = 2;
      tanggal = yesterday;
    } else if (hour >= cfg.shift2NightStartHour) {
      shiftNum = 2;
      tanggal = today;
    } else {
      // Jam kerja Shift 1 atau celah sore → tetap Shift 1 hari ini.
      shiftNum = 1;
      tanggal = today;
    }
  } else if (useYesterday) {
    shiftNum = 3;
    tanggal = yesterday;
  } else if (hour >= cfg.shift3ThirdStartHour) {
    shiftNum = 3;
    tanggal = today;
  } else if (hour >= cfg.shift3SecondStartHour) {
    shiftNum = 2;
    tanggal = today;
  } else {
    shiftNum = 1;
    tanggal = today;
  }
  const window = shiftWindowFromLabel(tanggal, scheme, shiftNum, cfg);
  if (!window) throw new Error('Konfigurasi shift tidak konsisten');
  return { shift: formatShiftLabel(shiftNum, scheme), shiftNum, scheme, tanggal, shiftStartWIB: window.startWIB };
}

/** Label jam "HH-(HH+1)"; jam 0 → "24-1", jam 23 → "23-24". */
export function hourToLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return '24-1';
  return `${String(h).padStart(2, '0')}-${String(h + 1).padStart(2, '0')}`;
}

/** Label slot fisik ke-`index` (0..24). Index 0 dan 24 berlabel sama → lookup selalu pakai index. */
export function slotLabel(index: number, hourlySlotOffset: number): string {
  return hourToLabel(HOURLY_BASE_START_HOUR + index + hourlySlotOffset);
}

/**
 * Index slot fisik untuk jam yang mulai di `slotStartWIB` pada report bertanggal `reportDate`.
 * Slot 0 = jam baseline (06:00 + offset) di tanggal report; di luar 0..24 → null.
 */
export function hourlyIndexAt(reportDate: string, slotStartWIB: Date, hourlySlotOffset: number): number | null {
  const base = atHour(reportDate, HOURLY_BASE_START_HOUR + hourlySlotOffset);
  const idx = Math.floor((slotStartWIB.getTime() - base.getTime()) / HOUR_MS);
  return idx >= 0 && idx < HOURLY_SLOT_COUNT ? idx : null;
}

export interface ShiftSlot {
  readonly index: number;
  readonly label: string;
}

/** Slot jam milik satu shift (urut waktu), dengan index fisik untuk lookup data hourly. */
export function getShiftSlots(reportDate: string, scheme: ShiftScheme, shiftNum: number, cfg: ShiftConfig): ShiftSlot[] {
  const window = shiftWindowFromLabel(reportDate, scheme, shiftNum, cfg);
  if (!window) return [];
  const out: ShiftSlot[] = [];
  for (let t = window.startWIB; t.getTime() < window.endWIB.getTime(); t = addHours(t, 1)) {
    const index = hourlyIndexAt(reportDate, t, cfg.hourlySlotOffset);
    if (index !== null) out.push({ index, label: hourToLabel(t.getUTCHours()) });
  }
  return out;
}

/** Urutan label jam satu shift (mod 24). `dow` 0=Minggu..6=Sabtu; Jumat memakai jam akhir Jumat. */
export function getShiftSlotLabels(scheme: ShiftScheme, shiftNum: number, dow: number, cfg: ShiftConfig): string[] {
  // Tanggal acuan sembarang dengan hari yang sama (2023-01-01 = Minggu).
  const ref = formatIsoDate(addDays(atHour('2023-01-01', 0), ((dow % 7) + 7) % 7));
  const window = shiftWindowFromLabel(ref, scheme, shiftNum, cfg);
  if (!window) return [];
  const out: string[] = [];
  for (let t = window.startWIB; t.getTime() < window.endWIB.getTime(); t = addHours(t, 1)) {
    out.push(hourToLabel(t.getUTCHours()));
  }
  return out;
}

const STALE_MAX_SLOTS = 20;

export interface StaleCheckInput {
  /** output_actual per index fisik 0..24; null = belum diisi. */
  readonly hourlyActual: readonly (number | null)[];
  readonly reportDate: string;
  readonly shiftStartWIB: Date;
  readonly nowWIB: Date;
  readonly thresholdMin: number;
  readonly hourlySlotOffset: number;
}

/** Stale bila ada slot yang sudah "due" (mulai < now − threshold) tetapi semua actual slot due itu null. */
export function isRowStale(input: StaleCheckInput): boolean {
  const limit = input.nowWIB.getTime() - input.thresholdMin * 60000;
  let dueCount = 0;
  let anyFilled = false;
  for (let k = 0; k < STALE_MAX_SLOTS; k += 1) {
    const slotStart = addHours(input.shiftStartWIB, k);
    if (slotStart.getTime() >= limit) break;
    const index = hourlyIndexAt(input.reportDate, slotStart, input.hourlySlotOffset);
    if (index === null) continue;
    dueCount += 1;
    const actual = input.hourlyActual[index];
    if (actual !== null && actual !== undefined) anyFilled = true;
  }
  return dueCount > 0 && !anyFilled;
}

export interface ShiftRow {
  readonly tanggal: string;
  readonly shift: string | null;
}

export interface PickOptions {
  /** Mode historis: hanya baris bertanggal persis ini. */
  readonly exactDate?: string | undefined;
  /** Mode historis: harus persis shift ini, kalau tidak ada → null. */
  readonly shiftOverride?: number | undefined;
}

function rowWindow(row: ShiftRow, cfg: ShiftConfig): ShiftWindow | null {
  const parsed = parseShiftLabel(row.shift);
  if (!parsed) return null;
  return shiftWindowFromLabel(row.tanggal, parsed.scheme, parsed.shiftNum, cfg);
}

/**
 * Pilih satu baris "kondisi sekarang" (LOGIC_SPEC §2). Jendela tiap baris dihitung dari teks shift baris
 * itu sendiri. Baris dengan teks shift rusak tidak ikut perbandingan jam.
 */
export function pickActiveRow<T extends ShiftRow>(rows: readonly T[], nowWIB: Date, cfg: ShiftConfig, options: PickOptions = {}): T | null {
  if (options.exactDate !== undefined) {
    const sameDate = rows.filter((r) => r.tanggal === options.exactDate);
    if (options.shiftOverride !== undefined) {
      return sameDate.find((r) => parseShiftLabel(r.shift)?.shiftNum === options.shiftOverride) ?? null;
    }
    let best: T | null = null;
    let bestEnd = Number.NEGATIVE_INFINITY;
    for (const row of sameDate) {
      const end = rowWindow(row, cfg)?.endWIB.getTime() ?? Number.NEGATIVE_INFINITY;
      if (best === null || end > bestEnd) {
        best = row;
        bestEnd = end;
      }
    }
    return best;
  }

  const now = nowWIB.getTime();
  let live: { row: T; start: number } | null = null;
  let finished: { row: T; end: number } | null = null;
  for (const row of rows) {
    const w = rowWindow(row, cfg);
    if (!w) continue;
    const start = w.startWIB.getTime();
    const end = w.endWIB.getTime();
    if (start <= now && now < end) {
      if (!live || start > live.start) live = { row, start };
    } else if (end <= now && (!finished || end > finished.end)) {
      finished = { row, end };
    }
  }
  return live?.row ?? finished?.row ?? null;
}

export type LineStatus = 'waiting' | 'running' | 'not_running' | 'no_data' | 'shift_not_found';

export interface LineStatusInput {
  readonly hasRow: boolean;
  /** Semua field wajib (Settings → syarat Running) terisi. */
  readonly complete: boolean;
  /** Hasil cek stale; caller mengirim false bila cek stale dimatikan di Settings. */
  readonly stale: boolean;
  /** Menit sejak awal shift berjalan (mode live). */
  readonly elapsedMin: number;
  readonly graceMin: number;
  readonly historical: boolean;
  readonly shiftRequested: boolean;
}

/**
 * Status line (OQ-011):
 * - live, belum ada report ATAU report belum lengkap: ≤ grace → waiting, lewat → not_running
 * - live, report lengkap: stale → not_running, selain itu running
 * - historis: tidak ada report → no_data / shift_not_found; ada → lengkap ? running : not_running
 */
export function getLineStatus3(input: LineStatusInput): LineStatus {
  if (input.historical) {
    if (!input.hasRow) return input.shiftRequested ? 'shift_not_found' : 'no_data';
    return input.complete ? 'running' : 'not_running';
  }
  if (!input.hasRow || !input.complete) return input.elapsedMin <= input.graceMin ? 'waiting' : 'not_running';
  return input.stale ? 'not_running' : 'running';
}

export function elapsedSince(start: Date, now: Date): number {
  return diffMinutes(now, start);
}
