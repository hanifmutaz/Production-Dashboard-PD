// Harness integrasi: pg-mem (Postgres in-memory) untuk DB dashboard & fixture ConMas.
// Catatan jujur: pg-mem ≠ Postgres asli. Lulus di sini belum membuktikan perilaku di Postgres produksi.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataType, newDb, type IMemoryDb } from 'pg-mem';
import pino from 'pino';
import { DEFAULT_SHIFT_CONFIG } from '@v3/shared';
import { createApp } from '../app.js';
import { loadReportColumns, type ReportColumns } from '../columns/reportColumns.js';
import { createConmasReader } from '../db/conmas.js';
import type { DbPool } from '../db/pool.js';
import { AuthService } from '../modules/auth/authService.js';
import { buildRow, fixtureColumns, fixtureDdl, insertSql, type ReportSpec } from '../devtools/devFixture.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function registerPgCompat(db: IMemoryDb): void {
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

export function migrationStatements(): string[] {
  const sql = readFileSync(path.join(root, 'apps/api/migrations/1732400000000_init.sql'), 'utf8').split('-- Down Migration')[0] ?? '';
  return sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.split('\n').every((l) => l.trim().startsWith('--')));
}

export interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly dashboardDb: IMemoryDb;
  readonly conmasDb: IMemoryDb;
  readonly dashboard: DbPool;
  readonly rc: ReportColumns;
  readonly conmasQueries: string[];
  addReports(specs: readonly ReportSpec[]): void;
  createUser(username: string, role: string, password?: string, locations?: string[]): Promise<number>;
}

export const DEFAULT_NOW = Date.UTC(2026, 10, 24, 3, 0); // 2026-11-24 10:00 WIB (Selasa)

export async function createHarness(opts: { now?: number; subcontEnabled?: boolean; dropColumns?: string[] } = {}): Promise<Harness> {
  const dashboardDb = newDb();
  registerPgCompat(dashboardDb);
  for (const s of migrationStatements()) dashboardDb.public.none(s);
  dashboardDb.public.none(
    `INSERT INTO lines (line_code, shift_scheme, location) VALUES ('L01', 2, 'internal'), ('L02', 2, 'internal'), ('L03', 3, 'internal'), ('S01', 2, 'sgp')`,
  );

  const rc0 = loadReportColumns(path.join(root, 'config/reportColumns.example.js'));
  const rc: ReportColumns = { ...rc0, VIEW: 'view_report_dev' };
  const conmasDb = newDb();
  registerPgCompat(conmasDb);
  const dropped = new Set(opts.dropColumns ?? []);
  const ddl = fixtureDdl(rc, 'fixture_report_dev');
  conmasDb.public.none(
    dropped.size === 0
      ? ddl
      : `CREATE TABLE fixture_report_dev (${fixtureColumns(rc)
          .filter((c) => !dropped.has(c.name))
          .map((c) => `"${c.name}" ${c.type}`)
          .join(', ')})`,
  );
  conmasDb.public.none(`CREATE VIEW view_report_dev AS SELECT * FROM fixture_report_dev`);

  const { Pool: DashPool } = dashboardDb.adapters.createPg();
  const dashboard = new DashPool() as unknown as DbPool;
  const { Pool: ConPool } = conmasDb.adapters.createPg();
  const conPool = new ConPool() as unknown as DbPool;
  const conmasQueries: string[] = [];
  const baseReader = createConmasReader(conPool);
  const conmas = {
    select: (sql: string, params?: readonly unknown[]) => {
      conmasQueries.push(sql);
      return baseReader.select(sql, params);
    },
  } as typeof baseReader;

  const available = new Set(
    fixtureColumns(rc)
      .map((c) => c.name)
      .filter((c) => !dropped.has(c)),
  );
  const now = opts.now ?? DEFAULT_NOW;
  const app = createApp({
    dashboard,
    conmas,
    reportColumns: rc,
    availableColumns: available,
    shift: DEFAULT_SHIFT_CONFIG,
    subcontEnabled: opts.subcontEnabled ?? false,
    syncKeys: { sgp: 'sgp-key-123456', systech: 'systech-key-123456' },
    syncStaleAfterSec: 300,
    auth: { sessionTtlHours: 12, maxAttempts: 3, lockMinutes: 15 },
    cookieSecure: false,
    pairingTtlMin: 10,
    executiveCacheSec: 0,
    trustProxy: 0,
    logger: pino({ level: process.env['TEST_LOG'] === '1' ? 'error' : 'silent' }),
    clock: () => now,
  });

  return {
    app,
    dashboardDb,
    conmasDb,
    dashboard,
    rc,
    conmasQueries,
    addReports(specs) {
      for (const spec of specs) {
        const row = Object.fromEntries(Object.entries(buildRow(rc, spec)).filter(([k]) => !dropped.has(k)));
        const { sql, params } = insertSql('fixture_report_dev', row);
        // pg-mem: parameter lewat adapter; di sini pakai literal yang di-escape (hanya data fixture).
        const literal = sql.replace(/\$(\d+)/g, (_, i: string) => {
          const v = params[Number(i) - 1];
          return v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
        });
        conmasDb.public.none(literal);
      }
    },
    async createUser(username, role, password = 'password-rahasia-1', locations = []) {
      const hash = await AuthService.hashPassword(password);
      const r = dashboardDb.public.one(
        `INSERT INTO users (username, display_name, password_hash, role_id) SELECT '${username}', '${username}', '${hash}', id FROM roles WHERE code = '${role}' RETURNING id`,
      );
      const id = Number(r['id']);
      for (const l of locations) dashboardDb.public.none(`INSERT INTO user_site_scope (user_id, location) VALUES (${id}, '${l}')`);
      return id;
    },
  };
}
