// Server DEV tanpa Postgres: API v3 + web build, data dari pg-mem + fixture sintetis (npm run dev:mem).
// Ditolak di production. Data hilang saat server dimatikan. Angka = fixture, BUKAN data ConMas.
import { existsSync } from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { DEFAULT_SHIFT_CONFIG, formatIsoDate, toWib } from '@v3/shared';
import { createApp } from '../app.js';
import { loadReportColumns } from '../columns/reportColumns.js';
import { createConmasReader } from '../db/conmas.js';
import type { DbPool } from '../db/pool.js';
import { AuthService } from '../modules/auth/authService.js';
import { buildRow, fixtureColumns, fixtureDdl, insertSql, standardScenario } from './devFixture.js';
import { inlineParams, newConmasMemDb, newDashboardMemDb, REPO_ROOT } from './memDb.js';

async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') throw new Error('dev:mem dilarang di production');
  const port = Number(process.env['PORT'] ?? 3000);
  const fixedNow = process.env['DEV_NOW'] ? Date.parse(process.env['DEV_NOW']) : null;
  const clock = (): number => fixedNow ?? Date.now();
  const logger = pino({ level: process.env['LOG_LEVEL']?.toLowerCase() ?? 'warn' });

  const rc = { ...loadReportColumns(path.join(REPO_ROOT, 'config/reportColumns.example.js')), VIEW: 'view_report_dev' };
  const dashDb = newDashboardMemDb();
  const conDb = newConmasMemDb();
  conDb.public.none(fixtureDdl(rc, 'fixture_report_dev'));
  conDb.public.none('CREATE VIEW view_report_dev AS SELECT * FROM fixture_report_dev');
  const now = toWib(clock());
  const specs = standardScenario(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  for (const spec of specs) {
    const { sql, params } = insertSql('fixture_report_dev', buildRow(rc, spec));
    conDb.public.none(inlineParams(sql, params));
  }
  dashDb.public.none(
    `INSERT INTO lines (line_code, shift_scheme, location) VALUES ('DEV-L01', 2, 'internal'), ('DEV-L02', 2, 'internal'), ('DEV-L03', 3, 'internal')`,
  );
  const hash = await AuthService.hashPassword('admin12345');
  dashDb.public.none(
    `INSERT INTO users (username, email, display_name, password_hash, role_id) SELECT 'admin', 'admin@example.test', 'Admin', '${hash}', id FROM roles WHERE code = 'admin'`,
  );
  for (const site of ['internal', 'sgp', 'systech']) {
    dashDb.public.none(`INSERT INTO user_site_scope (user_id, location) SELECT id, '${site}' FROM users WHERE email = 'admin@example.test'`);
  }
  const ym = formatIsoDate(now).slice(0, 7).split('-').map(Number);
  dashDb.public.none(`INSERT INTO targets (location, year, month, target) VALUES ('internal', ${ym[0]}, ${ym[1]}, 60000)`);
  dashDb.public.none(
    `INSERT INTO line_targets (line_code, year, month, target, work_days) VALUES ('DEV-L01', ${ym[0]}, ${ym[1]}, 36000, 21), ('DEV-L02', ${ym[0]}, ${ym[1]}, 40000, 21)`,
  );
  dashDb.public.none(`UPDATE lines SET product = 'PRODUK-DEV-' || substring(line_code from 7 for 1)`);

  const { Pool: DashPool } = dashDb.adapters.createPg();
  const { Pool: ConPool } = conDb.adapters.createPg();
  const app = createApp({
    productionModeFrom: '2026-11-25',
    dashboard: new DashPool() as unknown as DbPool,
    conmas: createConmasReader(new ConPool() as unknown as DbPool),
    reportColumns: rc,
    availableColumns: new Set(fixtureColumns(rc).map((c) => c.name)),
    shift: DEFAULT_SHIFT_CONFIG,
    subcontEnabled: false,
    syncKeys: { sgp: '', systech: '' },
    syncStaleAfterSec: 300,
    auth: { sessionTtlHours: 12, maxAttempts: 5, lockMinutes: 15 },
    cookieSecure: false,
    pairingTtlMin: 10,
    executiveCacheSec: 0,
    trustProxy: 0,
    logger,
    clock,
    webDistDir: path.join(REPO_ROOT, 'apps/web/dist'),
  });
  app.listen(port, () => {
    const web = existsSync(path.join(REPO_ROOT, 'apps/web/dist/index.html')) ? '' : ' (web belum di-build: npm run build -w @v3/web)';
    console.log(`dev:mem jalan di http://localhost:${port}${web} — login admin@example.test / admin12345 — ${specs.length} report fixture`);
  });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
