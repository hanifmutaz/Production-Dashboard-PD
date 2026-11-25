// pg-mem (Postgres in-memory) untuk tes & server dev tanpa Postgres. JANGAN dipakai di production.
// pg-mem ≠ Postgres asli: fungsi di bawah didaftarkan manual agar SQL aplikasi bisa jalan.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataType, newDb, type IMemoryDb } from 'pg-mem';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

export function registerPgCompat(db: IMemoryDb): void {
  db.public.registerFunction({
    name: 'length',
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (value: string) => Array.from(value).length,
  });
  db.public.registerFunction({
    name: 'regexp_replace',
    args: [DataType.text, DataType.text, DataType.text],
    returns: DataType.text,
    implementation: (s: string, pattern: string, replacement: string) => s.replace(new RegExp(pattern), replacement),
  });
  db.public.registerOperator({
    operator: '~',
    left: DataType.text,
    right: DataType.text,
    returns: DataType.bool,
    implementation: (a: string, b: string) => new RegExp(b).test(a),
  });
  db.public.registerFunction({
    name: 'trim',
    args: [DataType.text],
    returns: DataType.text,
    implementation: (s: string | null) => (s === null ? null : s.trim()),
  });
  db.public.registerFunction({
    name: 'nullif',
    args: [DataType.text, DataType.text],
    returns: DataType.text,
    implementation: (a: string | null, b: string | null) => (a === b ? null : a),
  });
  db.public.registerFunction({
    name: 'date',
    args: [DataType.timestamp],
    returns: DataType.date,
    implementation: (t: Date | null) => (t === null ? null : new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()))),
  });
  db.public.registerFunction({
    name: 'to_char',
    args: [DataType.date, DataType.text],
    returns: DataType.text,
    implementation: (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10)),
  });
}

const MIGRATIONS = ['1732400000000_init.sql', '1732500000000_planning_lines.sql', '1732600000000_user_email.sql'];

export function migrationStatements(): string[] {
  return MIGRATIONS.flatMap((file) => {
    const sql = readFileSync(path.join(REPO_ROOT, 'apps/api/migrations', file), 'utf8').split('-- Down Migration')[0] ?? '';
    return sql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.split('\n').every((l) => l.trim().startsWith('--')));
  });
}

export function newDashboardMemDb(): IMemoryDb {
  const db = newDb();
  registerPgCompat(db);
  for (const s of migrationStatements()) db.public.none(s);
  return db;
}

export function newConmasMemDb(): IMemoryDb {
  const db = newDb();
  registerPgCompat(db);
  return db;
}

/** Ubah INSERT berparameter jadi literal (hanya data fixture; pg-mem `none()` tidak menerima parameter). */
export function inlineParams(sql: string, params: readonly (string | number | null)[]): string {
  return sql.replace(/\$(\d+)/g, (_, i: string) => {
    const v = params[Number(i) - 1];
    return v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
  });
}
