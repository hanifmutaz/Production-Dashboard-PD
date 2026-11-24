// OQ-011 / OQ-012: aturan status line yang bisa diubah di menu Settings.

/** Field yang bisa dijadikan syarat "Running". Urutan = urutan tampilan di Settings. */
export const RUNNING_FIELDS = ['cl_no', 'line_leader', 'cell_leader', 'teknisi', 'inspector', 'output_plan', 'output_actual'] as const;
export type RunningField = (typeof RUNNING_FIELDS)[number];

export const RUNNING_FIELD_LABEL: Readonly<Record<RunningField, string>> = {
  cl_no: 'CL No',
  line_leader: 'Line Leader',
  cell_leader: 'Cell Leader',
  teknisi: 'Teknisi',
  inspector: 'Inspector',
  output_plan: 'Output Plan',
  output_actual: 'Output Actual',
};

export interface LineStatusSettings {
  /** Field yang wajib terisi agar line dianggap Running. Angka 0 dihitung terisi; kosong = belum. */
  readonly requiredFields: readonly RunningField[];
  /** Cek stale: report ada tapi tidak ada output per jam yang diisi setelah `staleThresholdMin` menit. */
  readonly staleEnabled: boolean;
  readonly staleThresholdMin: number;
  /** Terapkan cek stale juga di ringkasan shift berjalan (bukan hanya detail line). */
  readonly staleInSummary: boolean;
}

export function defaultLineStatusSettings(staleThresholdMin: number): LineStatusSettings {
  return { requiredFields: [...RUNNING_FIELDS], staleEnabled: true, staleThresholdMin, staleInSummary: true };
}

/** Field wajib yang belum terisi, urut sesuai RUNNING_FIELDS. */
export function missingRunningFields(filled: ReadonlySet<RunningField>, required: readonly RunningField[]): RunningField[] {
  const req = new Set(required);
  return RUNNING_FIELDS.filter((f) => req.has(f) && !filled.has(f));
}
