import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadReportColumns } from '../apps/api/src/columns/reportColumns.js';
import { parseViewColumns, validateMapping } from './validateColumns.js';

const root = path.resolve(import.meta.dirname, '..');
const rc = loadReportColumns(path.join(root, 'config/reportColumns.example.js'));
const view = parseViewColumns(readFileSync(path.join(root, 'docs/view_columns.txt'), 'utf8'));

describe('validate:columns', () => {
  it('mapping contoh lulus; 2 kolom ditandai belum ada di DB', () => {
    const r = validateMapping(rc, view);
    expect(r.errors).toEqual([]);
    expect(r.referenced).toBe(874);
    expect(r.warnings).toHaveLength(2);
  });
  it('mendeteksi offset REJECT_PAIRS yang salah dan kolom tak dikenal', () => {
    const broken = structuredClone(rc);
    broken.REJECT_PAIRS[3] = { ...broken.REJECT_PAIRS[3]!, minute: 'cluster_1_217_t' };
    broken.COLS.oee = 'cluster_1_99999_n';
    const r = validateMapping(broken, view);
    expect(r.errors.some((e) => e.includes('REJECT_PAIRS[3].minute'))).toBe(true);
    expect(r.errors.some((e) => e.includes('cluster_1_99999_n'))).toBe(true);
  });
  it('mendeteksi field angka yang memakai kolom teks (mis. PRODUCT NAME _n vs _t)', () => {
    const broken = structuredClone(rc);
    broken.COLS.oee = 'cluster_1_8_t';
    broken.PRODUCT_SLOTS[0] = { ...broken.PRODUCT_SLOTS[0]!, product_name: 'cluster_1_2776_n' };
    const errors = validateMapping(broken, view).errors;
    expect(errors).toContain('COLS.oee = cluster_1_8_t, seharusnya kolom _n');
    expect(errors).toContain('PRODUCT_SLOTS[0].product_name = cluster_1_2776_n, seharusnya kolom _t');
  });
});
