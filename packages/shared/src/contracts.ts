// Kontrak respons API v3 (dipakai api & web). Bentuk mengikuti LOGIC_SPEC §4, §7, §8 dan SOURCE_BOOK mockup.
import type { RunningField } from './runningRules.js';
import type { LineStatus } from './shift.js';

export type Tempat = 'internal' | 'sgp' | 'systech';
export const TEMPAT_LIST: readonly Tempat[] = ['internal', 'sgp', 'systech'];

/** Status sumber data per lokasi. SGP/Systech = on_hold selama SUBCONT_ENABLED=false. */
export type SourceStatus = 'ok' | 'on_hold' | 'unavailable';

export interface HourlyPoint {
  readonly slot: number;
  readonly label: string;
  readonly output_plan: number | null;
  readonly output_actual: number | null;
  /** Plan − Actual (OQ-006). */
  readonly deviasi: number | null;
  readonly pencapaian: number | null;
}

export interface LineDetail {
  readonly line: string;
  readonly shift: string | null;
  readonly tanggal: string | null;
  readonly line_status: LineStatus;
  readonly line_not_running: boolean;
  readonly cell_leader_nama: string | null;
  readonly pj_teknis_nama: string | null;
  readonly inspector_nama: string | null;
  readonly product_name: string | null;
  readonly cl_no: string | null;
  readonly cycle_time_swi: number | null;
  readonly cycle_time_actual: number | null;
  readonly output_plan: number | null;
  readonly output_total: number | null;
  /** Plan − Actual (OQ-006): positif = kurang dari target. */
  readonly deviasi_target: number | null;
  readonly reject_qty: number | null;
  readonly qty_reject_ppm: number | null;
  /** Menit (OQ-001). */
  readonly stoptime_total: number | null;
  readonly stoptime_man: number | null;
  readonly stoptime_machine: number | null;
  readonly stoptime_material: number | null;
  readonly stoptime_method: number | null;
  readonly stoptime_other: number | null;
  readonly availability_operator: number | null;
  readonly hourly: readonly HourlyPoint[];
  /** Field syarat Running yang belum terisi (Settings → line_status). */
  readonly missing_fields: readonly RunningField[];
  readonly historical: boolean;
  readonly available_shifts: readonly string[];
}

/** "Tidak ada data" = 200 + data:null + status (bukan error). */
export interface DataEnvelope<T> {
  readonly data: T | null;
  readonly status: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface SummaryTotals {
  readonly lines_total: number;
  readonly lines_running: number;
  readonly lines_waiting: number;
  readonly lines_not_running: number;
  readonly output_plan: number;
  readonly output_actual: number;
  /** Reject M107 saja (OQ-002). */
  readonly qty_reject: number;
  /** Σreject / (Σoutput + Σreject) × 1e6 (OQ-003). */
  readonly reject_ppm: number | null;
  /** Menit (OQ-001). */
  readonly stoptime_total: number;
  /** OEE berbobot jam_target, tanpa anomali (OQ-004/005). */
  readonly oee: number | null;
  /** Jumlah report dengan OEE di luar 0–100 (dikeluarkan dari OEE). */
  readonly oee_anomaly_count: number;
  /** SUM kolom TOTAL (OQ-007), satuan MENIT. */
  readonly sogo: number;
  readonly shugyo: number;
  readonly kikai: number;
}

export interface TrendDay {
  readonly date: string;
  readonly plan: number;
  readonly actual: number;
  readonly stoptime: number;
  readonly hasData: boolean;
}

export interface RangeTrend {
  readonly days: readonly TrendDay[];
  readonly totals: { readonly plan: number; readonly actual: number; readonly bekidoritsu: number; readonly stoptime: number };
}

export interface BreakdownLine {
  readonly line_code: string;
  readonly product_name: string | null;
  readonly tempat: string;
  readonly output_plan: number;
  readonly output_actual: number;
  readonly qty_reject: number;
  readonly reject_ppm: number | null;
  readonly bekidoritsu: number;
  /** Plan − Actual (OQ-006). */
  readonly deviasi: number;
  readonly days: readonly { readonly date: string; readonly plan: number; readonly actual: number; readonly hasData: boolean }[];
}

export interface RejectItem {
  readonly name: string;
  readonly qty: number;
}

export interface StoptimeEvent {
  readonly kategori: string | null;
  readonly masalah: string | null;
  readonly minute: number | null;
}

export interface ErrorBody {
  readonly error: { readonly code: string; readonly message: string; readonly requestId: string };
}
