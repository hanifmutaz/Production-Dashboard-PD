// Loader mapping kolom ConMas. File runtime `config/reportColumns.js` di-gitignore (beda per instance).
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { z } from 'zod';

const colName = z.string().regex(/^[a-z0-9_]+$/, 'nama kolom hanya boleh [a-z0-9_]');

const reportColumnsSchema = z.object({
  VIEW: z.string().regex(/^[A-Za-z0-9_]+$/, 'nama view hanya boleh [A-Za-z0-9_]'),
  COLS: z.object({
    production_mode: colName.default('cluster_1_1_t'),
    line: colName,
    cell_leader: colName,
    teknisi: colName,
    inspector: colName,
    group: colName,
    line_leader: colName,
    tanggal: colName,
    shift: colName,
    oee: colName,
    availability: colName,
    performance: colName,
    quality: colName,
    reject_ppm: colName,
    output_plan: colName,
    output_actual: colName,
    reject_p027: colName,
    reject_p028: colName,
    reject_m107: colName,
    jam_target: colName,
    jam_efektif: colName,
    availability_loss: colName,
    performance_loss: colName,
    quality_loss: colName,
    not_oee: colName,
    sogo: colName,
    shugyo: colName,
    kikai: colName,
    stoptime_man: colName,
    stoptime_method: colName,
    stoptime_material: colName,
    stoptime_machine: colName,
    stoptime_other: colName,
    change_point: colName,
    rep_top_id: colName,
    rev_no: colName,
    public_status: colName,
    sys_update_time: colName,
  }),
  PRODUCT_SLOTS: z
    .array(z.object({ cl_no: colName, product_name: colName, mo_no: colName, qty: colName, swi: colName, actual: colName }))
    .length(6),
  HOURLY_COLUMNS: z.array(z.tuple([colName, colName])).length(25),
  REJECT_PAIRS: z.array(z.object({ qty: colName, name: colName, minute: colName, masalah: colName, kategori: colName })).length(150),
});

export type ReportColumns = z.infer<typeof reportColumnsSchema>;
export type ColumnKey = keyof ReportColumns['COLS'];

export function parseReportColumns(raw: unknown): ReportColumns {
  const result = reportColumnsSchema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Mapping kolom tidak valid: ${detail}`);
  }
  return result.data;
}

/** Muat mapping dari file CommonJS. Gagal cepat dengan pesan jelas bila file tidak ada. */
export function loadReportColumns(filePath: string): ReportColumns {
  const abs = path.resolve(filePath);
  if (!existsSync(abs)) {
    throw new Error(
      `File mapping kolom tidak ditemukan: ${abs}. Salin config/reportColumns.example.js menjadi config/reportColumns.js lalu sesuaikan.`,
    );
  }
  const require = createRequire(import.meta.url);
  return parseReportColumns(require(abs));
}

/** Semua nama kolom yang dirujuk mapping (unik, urut kemunculan). */
export function listReferencedColumns(rc: ReportColumns): string[] {
  const out: string[] = [...Object.values(rc.COLS)];
  for (const p of rc.PRODUCT_SLOTS) out.push(p.cl_no, p.product_name, p.mo_no, p.qty, p.swi, p.actual);
  for (const [plan, actual] of rc.HOURLY_COLUMNS) out.push(plan, actual);
  for (const r of rc.REJECT_PAIRS) out.push(r.kategori, r.masalah, r.qty, r.name, r.minute);
  return [...new Set(out)];
}
