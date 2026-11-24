import pino from 'pino';
import { listReferencedColumns, loadReportColumns } from './columns/reportColumns.js';
import { loadEnv, shiftConfigFromEnv } from './config/env.js';
import { createConmasPool, createConmasReader } from './db/conmas.js';
import { createDashboardPool } from './db/pool.js';
import { createApp } from './app.js';
import { loadAvailableColumns } from './modules/reporting/columns.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = pino({ level: env.LOG_LEVEL });
  const rc = loadReportColumns(env.REPORT_COLUMNS_PATH);
  const reportColumns = { ...rc, VIEW: env.DB_VIEW_NAME };

  const conmasPool = createConmasPool(env.CONMAS_DATABASE_URL);
  const conmas = createConmasReader(conmasPool);
  const dashboard = createDashboardPool(env.DASHBOARD_DATABASE_URL);

  const available = await loadAvailableColumns(conmas, reportColumns.VIEW);
  if (available.size === 0) throw new Error(`View ${reportColumns.VIEW} tidak ditemukan atau tidak bisa dibaca`);
  const missing = listReferencedColumns(reportColumns).filter((c) => !available.has(c));
  if (missing.length > 0) logger.warn({ missing }, 'Kolom mapping belum ada di view — dibaca sebagai NULL');

  const app = createApp({
    dashboard,
    conmas,
    reportColumns,
    availableColumns: available,
    shift: shiftConfigFromEnv(env),
    subcontEnabled: env.SUBCONT_ENABLED,
    syncKeys: { sgp: env.SYNC_KEY_SGP, systech: env.SYNC_KEY_SYSTECH },
    syncStaleAfterSec: env.SYNC_STALE_AFTER_SEC,
    auth: { sessionTtlHours: env.SESSION_TTL_HOURS, maxAttempts: env.LOGIN_MAX_ATTEMPTS, lockMinutes: env.LOGIN_LOCK_MINUTES },
    cookieSecure: env.COOKIE_SECURE,
    pairingTtlMin: env.PAIRING_CODE_TTL_MIN,
    executiveCacheSec: env.EXECUTIVE_CACHE_SEC,
    trustProxy: env.TRUST_PROXY,
    logger,
    ...(env.WEB_DIST_DIR ? { webDistDir: env.WEB_DIST_DIR } : {}),
  });
  const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'Dashboard V3 API berjalan'));
  const shutdown = (): void => {
    server.close(() => {
      void Promise.allSettled([conmasPool.end(), dashboard.end()]).then(() => process.exit(0));
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
