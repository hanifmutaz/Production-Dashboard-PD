// Konfigurasi jam shift. Semua nilai datang dari env (LOGIC_SPEC §2) — tidak ada hardcode di logika.
export interface ShiftConfig {
  readonly shift2StartHour: number;
  readonly shift2EndHourWeekday: number;
  readonly shift2EndHourFriday: number;
  readonly shift2NightStartHour: number;
  readonly shift3StartHour: number;
  readonly shift3SecondStartHour: number;
  readonly shift3ThirdStartHour: number;
  readonly lineNotRunningThresholdMin: number;
  readonly lineStartGraceMin: number;
  readonly hourlySlotOffset: number;
}

/** Default Internal sesuai tabel LOGIC_SPEC §2. Dipakai untuk tes & sebagai default env. */
export const DEFAULT_SHIFT_CONFIG: ShiftConfig = {
  shift2StartHour: 7,
  shift2EndHourWeekday: 16,
  shift2EndHourFriday: 17,
  shift2NightStartHour: 22,
  shift3StartHour: 6,
  shift3SecondStartHour: 14,
  shift3ThirdStartHour: 22,
  lineNotRunningThresholdMin: 120,
  lineStartGraceMin: 120,
  hourlySlotOffset: 0,
};

export type ShiftScheme = 2 | 3;

/** Baseline jam slot pertama di form (LOGIC_SPEC §3: label = 6 + index + offset). */
export const HOURLY_BASE_START_HOUR = 6;
export const HOURLY_SLOT_COUNT = 25;
