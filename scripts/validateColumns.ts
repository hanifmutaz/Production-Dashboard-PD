// validate:columns — cocokkan mapping kolom dengan docs/view_columns.txt (aturan keras #7). Gagal = exit 1.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listReferencedColumns, loadReportColumns, type ReportColumns } from '../apps/api/src/columns/reportColumns.js';

export interface ViewColumn {
  readonly name: string;
  readonly dataType: string;
  readonly label: string;
  readonly inDb: boolean;
}

export function parseViewColumns(text: string): Map<string, ViewColumn> {
  const map = new Map<string, ViewColumn>();
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  for (const line of lines.slice(1)) {
    const [, name, dataType, label, status] = line.split('\t');
    if (!name || !dataType) continue;
    map.set(name, { name, dataType, label: label ?? '', inDb: (status ?? 'DB') === 'DB' });
  }
  return map;
}

const SUFFIX_TYPE: Readonly<Record<string, string>> = {
  t: 'text',
  n: 'numeric',
  d: 'timestamp without time zone',
};

function clusterNum(col: string): number | null {
  const m = /^cluster_1_(\d+)_[tnd]$/.exec(col);
  return m ? Number(m[1]) : null;
}

export interface ValidationResult {
  readonly errors: string[];
  readonly warnings: string[];
  readonly referenced: number;
}

export function validateMapping(rc: ReportColumns, view: Map<string, ViewColumn>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const referenced = listReferencedColumns(rc);

  for (const col of referenced) {
    const v = view.get(col);
    if (!v) {
      errors.push(`Kolom ${col} tidak ada di view_columns.txt`);
      continue;
    }
    const suffix = col.slice(-1);
    const expected = col.startsWith('cluster_') ? SUFFIX_TYPE[suffix] : undefined;
    if (expected && v.dataType !== expected) errors.push(`Tipe ${col} = ${v.dataType}, seharusnya ${expected}`);
    if (!v.inDb) warnings.push(`Kolom ${col} (${v.label}) BELUM ADA di DB — dibaca sebagai NULL lewat guard runtime`);
  }

  // Tipe semantik per field mapping: angka → _n, teks → _t, tanggal → _d.
  const expectSuffix = (field: string, col: string, suffix: 't' | 'n' | 'd'): void => {
    if (col.startsWith('cluster_') && !col.endsWith(`_${suffix}`)) errors.push(`${field} = ${col}, seharusnya kolom _${suffix}`);
  };
  const TEXT_COLS = new Set(['line', 'cell_leader', 'teknisi', 'inspector', 'group', 'line_leader', 'shift']);
  for (const [key, col] of Object.entries(rc.COLS)) {
    expectSuffix(`COLS.${key}`, col, key === 'tanggal' ? 'd' : TEXT_COLS.has(key) ? 't' : 'n');
  }
  rc.PRODUCT_SLOTS.forEach((p, i) => {
    expectSuffix(`PRODUCT_SLOTS[${i}].cl_no`, p.cl_no, 't');
    expectSuffix(`PRODUCT_SLOTS[${i}].product_name`, p.product_name, 't');
    expectSuffix(`PRODUCT_SLOTS[${i}].mo_no`, p.mo_no, 't');
    expectSuffix(`PRODUCT_SLOTS[${i}].qty`, p.qty, 'n');
    expectSuffix(`PRODUCT_SLOTS[${i}].swi`, p.swi, 'n');
    expectSuffix(`PRODUCT_SLOTS[${i}].actual`, p.actual, 'n');
  });
  rc.HOURLY_COLUMNS.forEach(([plan, actual], i) => {
    expectSuffix(`HOURLY_COLUMNS[${i}][0]`, plan, 'n');
    expectSuffix(`HOURLY_COLUMNS[${i}][1]`, actual, 'n');
  });
  rc.REJECT_PAIRS.forEach((r, i) => {
    expectSuffix(`REJECT_PAIRS[${i}].kategori`, r.kategori, 't');
    expectSuffix(`REJECT_PAIRS[${i}].masalah`, r.masalah, 't');
    expectSuffix(`REJECT_PAIRS[${i}].name`, r.name, 't');
    expectSuffix(`REJECT_PAIRS[${i}].qty`, r.qty, 'n');
    expectSuffix(`REJECT_PAIRS[${i}].minute`, r.minute, 'n');
  });

  rc.HOURLY_COLUMNS.forEach(([plan, actual], i) => {
    const p = clusterNum(plan);
    const a = clusterNum(actual);
    if (p === null || a === null || a !== p + 1) errors.push(`HOURLY_COLUMNS[${i}] plan/actual tidak berurutan`);
  });

  rc.REJECT_PAIRS.forEach((r, i) => {
    const q = clusterNum(r.qty);
    if (q === null) {
      errors.push(`REJECT_PAIRS[${i}].qty bukan kolom cluster`);
      return;
    }
    const expect: ReadonlyArray<readonly [string, string, number]> = [
      ['kategori', r.kategori, q - 7],
      ['masalah', r.masalah, q - 4],
      ['name', r.name, q + 1],
      ['minute', r.minute, q + 2],
    ];
    for (const [field, col, num] of expect) {
      if (clusterNum(col) !== num) errors.push(`REJECT_PAIRS[${i}].${field} = ${col}, pola offset mengharapkan cluster_1_${num}`);
    }
  });

  return { errors, warnings, referenced: referenced.length };
}

function main(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const view = parseViewColumns(readFileSync(path.join(root, 'docs/view_columns.txt'), 'utf8'));
  const targets = ['config/reportColumns.example.js', 'config/reportColumns.js'].filter((f) => existsSync(path.join(root, f)));
  let failed = false;
  for (const file of targets) {
    const result = validateMapping(loadReportColumns(path.join(root, file)), view);
    console.log(`\n${file}: ${result.referenced} kolom dirujuk, ${result.errors.length} error, ${result.warnings.length} peringatan`);
    result.warnings.forEach((w) => console.log(`  ! ${w}`));
    result.errors.forEach((e) => console.log(`  ✗ ${e}`));
    if (result.errors.length > 0) failed = true;
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
