// Pembangun ekspresi SQL dari mapping kolom + daftar kolom yang benar-benar ada di view.
// Kolom yang belum ada di DB (mis. Masalah 70/86) dibaca sebagai NULL, tidak memicu "column does not exist".
import type { ReportColumns } from '../../columns/reportColumns.js';
import type { ConmasReader } from '../../db/conmas.js';

import { parentCodePattern, reinspectPattern } from '../masterData/lineCodes.js';
import { z } from 'zod';

export class ColumnSql {
  constructor(
    readonly rc: ReportColumns,
    private readonly available: ReadonlySet<string>,
    private readonly productionModeFrom: string,
  ) {
    z.iso.date().parse(productionModeFrom);
  }

  get view(): string {
    return `"${this.rc.VIEW}"`;
  }

  has(col: string): boolean {
    return this.available.has(col);
  }

  /** Referensi kolom; nama sudah divalidasi regex [a-z0-9_] oleh loader. */
  ref(col: string): string | null {
    return this.available.has(col) ? `"${col}"` : null;
  }

  /** Nilai numerik untuk agregasi: kosong/NULL → 0 (LOGIC_SPEC §3). */
  numAgg(col: string): string {
    const r = this.ref(col);
    return r ? `COALESCE(NULLIF(TRIM(${r}::text), '')::numeric, 0)` : '0';
  }

  /** Nilai numerik baris tunggal: kosong → NULL (null ≠ 0 untuk per jam). */
  num(col: string): string {
    const r = this.ref(col);
    return r ? `NULLIF(TRIM(${r}::text), '')::numeric` : 'NULL::numeric';
  }

  text(col: string): string {
    const r = this.ref(col);
    return r ? `NULLIF(TRIM(${r}::text), '')` : 'NULL::text';
  }

  /** DATE(kolom) polos tanpa AT TIME ZONE (kolom naive), dikembalikan sebagai teks agar tidak geser hari. */
  get dateText(): string {
    return `to_char(DATE(${this.mustRef(this.rc.COLS.tanggal)}), 'YYYY-MM-DD')`;
  }

  get dateExpr(): string {
    return `DATE(${this.mustRef(this.rc.COLS.tanggal)})`;
  }

  get productionModePredicate(): string {
    const mode = `NULLIF(LOWER(TRIM(${this.mustRef(this.rc.COLS.production_mode)}::text)), '')`;
    return `(${this.dateExpr} IS NOT NULL AND (${mode} = 'true' OR (${mode} IS NULL AND ${this.dateExpr} < '${this.productionModeFrom}'::date)) AND ${this.lineExpr} ~ '${parentCodePattern}' AND NOT (LOWER(${this.rawLine}) ~ '${reinspectPattern}'))`;
  }

  private get rawLine(): string {
    return `TRIM(${this.mustRef(this.rc.COLS.line)}::text)`;
  }

  get lineExpr(): string {
    return `regexp_replace(${this.rawLine}, '[A-Za-z]$', '')`;
  }

  mustRef(col: string): string {
    const r = this.ref(col);
    if (!r) throw new Error(`Kolom wajib ${col} tidak ada di view ${this.rc.VIEW}`);
    return r;
  }
}

export async function loadAvailableColumns(reader: ConmasReader, view: string): Promise<Set<string>> {
  const { rows } = await reader.select<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
    [view],
  );
  return new Set(rows.map((r) => r.column_name));
}

export function missingMappedColumns(rc: ReportColumns, available: ReadonlySet<string>, referenced: readonly string[]): string[] {
  void rc;
  return referenced.filter((c) => !available.has(c));
}

export function placeholders(count: number, startAt = 1): string {
  return Array.from({ length: count }, (_, i) => `$${i + startAt}`).join(', ');
}

/** pg mengembalikan numeric sebagai string. */
export function toNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toNum0(value: unknown): number {
  return toNum(value) ?? 0;
}

export function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}
