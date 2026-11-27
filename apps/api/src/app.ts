import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pino, { type Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { ShiftConfig } from '@v3/shared';
import type { ConmasReader } from './db/conmas.js';
import type { DbPool } from './db/pool.js';
import { authenticate, requireAuth, canSeeLocation, requirePermission } from './http/auth.js';
import { errorHandler, notFoundHandler } from './http/errors.js';
import type { ReportColumns } from './columns/reportColumns.js';
import { accessRoutes } from './modules/access/routes.js';
import { AuthService } from './modules/auth/authService.js';
import { authRoutes } from './modules/auth/routes.js';
import { ExecutiveService } from './modules/executive/executiveService.js';
import { executiveRoutes } from './modules/executive/routes.js';
import { exportRoutes } from './modules/export/routes.js';
import { LinesRepository } from './modules/masterData/linesRepository.js';
import { linesRoutes } from './modules/masterData/routes.js';
import { ColumnSql } from './modules/reporting/columns.js';
import { ConmasRepository } from './modules/reporting/conmasRepository.js';
import { ReportingService, type Clock } from './modules/reporting/reportingService.js';
import { reportingRoutes } from './modules/reporting/routes.js';
import { planningRoutes } from './modules/planning/routes.js';
import { settingsRoutes } from './modules/settings/routes.js';
import { SettingsService } from './modules/settings/settingsService.js';
import { SnapshotRepository } from './modules/sync/day.js';
import { syncRoutes } from './modules/sync/routes.js';

export interface AppDeps {
  readonly dashboard: DbPool;
  readonly conmas: ConmasReader;
  readonly reportColumns: ReportColumns;
  readonly availableColumns: ReadonlySet<string>;
  readonly shift: ShiftConfig;
  readonly subcontEnabled: boolean;
  readonly syncKeys: { sgp: string; systech: string };
  readonly syncStaleAfterSec: number;
  readonly auth: { sessionTtlHours: number; maxAttempts: number; lockMinutes: number };
  readonly cookieSecure: boolean;
  readonly pairingTtlMin: number;
  readonly executiveCacheSec: number;
  readonly trustProxy: number;
  readonly logger?: Logger;
  readonly clock?: Clock;
  /** Folder hasil build web (apps/web/dist). Bila ada, disajikan dari server yang sama. */
  readonly productionModeFrom: string;
  readonly webDistDir?: string;
}

const REQUEST_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  // Di belakang Cloudflare Tunnel / reverse proxy (LOGIC_SPEC §1)
  app.set('trust proxy', deps.trustProxy);

  const logger = deps.logger ?? pino({ level: 'info' });
  app.use((req, res, next) => {
    const incoming = req.get('x-request-id');
    req.requestId = incoming && REQUEST_ID_RE.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', req.requestId);
    next();
  });
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as unknown as { requestId: string }).requestId,
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-sync-key"]', 'res.headers["set-cookie"]'],
        censor: '[REDACTED]',
      },
    }),
  );
  // Pilot LAN memakai HTTP; mode cookie Secure mempertahankan kebijakan HTTPS.
  app.use(helmet(deps.cookieSecure ? {} : { contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));
  app.use(cookieParser());

  const linesRepo = new LinesRepository(deps.dashboard);
  const cols = new ColumnSql(deps.reportColumns, deps.availableColumns, deps.productionModeFrom);
  const conmasRepo = new ConmasRepository(deps.conmas, cols);
  const settingsService = new SettingsService(deps.dashboard, {
    staleThresholdMin: deps.shift.lineNotRunningThresholdMin,
    shift: { ...deps.shift },
  });
  const statusOfSite = async (site: string, start?: string, end?: string): Promise<'ok' | 'on_hold' | 'unavailable'> => {
    if (site === 'internal') return 'ok';
    if (!deps.subcontEnabled || !deps.syncKeys[site as 'sgp' | 'systech']) return 'on_hold';
    const now = (deps.clock ?? Date.now)();
    const today = new Date(now + 7 * 3600000).toISOString().slice(0, 10);
    if (start && end) {
      const last = end < today ? end : today;
      if (start > last) return 'unavailable';
      const expected = 1 + (Date.parse(last) - Date.parse(start)) / 86400000;
      const coverage = await deps.dashboard.query(
        'SELECT COUNT(*) AS days FROM push_snapshots WHERE source=$1 AND type BETWEEN $2 AND $3',
        [site, 'production-day-' + start, 'production-day-' + last],
      );
      if (Number(coverage.rows[0]?.['days']) !== expected) return 'unavailable';
      if (last < today) return 'ok';
    }
    const { rows } = await deps.dashboard.query('SELECT received_at FROM push_snapshots WHERE source=$1 AND type=$2', [
      site,
      'production-day-' + today,
    ]);
    return rows[0] && now - new Date(String(rows[0]['received_at'])).getTime() <= deps.syncStaleAfterSec * 1000 ? 'ok' : 'unavailable';
  };
  const resolveSite = async (site: string) =>
    new ReportingService(
      site === 'internal' ? conmasRepo : new SnapshotRepository(deps.dashboard, site),
      linesRepo,
      { ...deps.shift, ...(await settingsService.siteShift(site)) },
      settingsService,
      deps.clock,
    );
  const reporting = new ReportingService(conmasRepo, linesRepo, deps.shift, settingsService, deps.clock, resolveSite, statusOfSite);
  const executive = new ExecutiveService(deps.dashboard, reporting, {
    subcontEnabled: deps.subcontEnabled,
    cacheSec: deps.executiveCacheSec,
    ...(deps.clock ? { clock: deps.clock } : {}),
  });
  const authService = new AuthService(deps.dashboard, deps.auth);

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/readyz', async (_req, res) => {
    const check = async (fn: () => Promise<unknown>): Promise<boolean> =>
      fn().then(
        () => true,
        () => false,
      );
    const dashboard = await check(() => deps.dashboard.query('SELECT 1'));
    const conmas = await check(() => deps.conmas.select('SELECT 1'));
    res.status(dashboard && conmas ? 200 : 503).json({ status: dashboard && conmas ? 'ok' : 'degraded', dashboard, conmas });
  });

  // Push-sync punya body parser sendiri (limit 10 MB) → dipasang sebelum parser global.
  app.use(
    '/api/sync',
    authenticate(authService),
    syncRoutes(deps.dashboard, { enabled: deps.subcontEnabled, keys: deps.syncKeys, staleAfterSec: deps.syncStaleAfterSec }),
  );

  app.use(express.json({ limit: '200kb' }));
  app.use('/api/v3', authenticate(authService));
  app.use(
    '/api/v3/auth',
    authRoutes(authService, deps.dashboard, { cookieSecure: deps.cookieSecure, ...(deps.clock ? { clock: deps.clock } : {}) }),
  );
  app.use('/api/v3', requireAuth);
  app.get('/api/v3/sites', requirePermission('dashboard.view', 'config.view'), async (req, res, next) => {
    try {
      const sites = ['internal', 'sgp', 'systech'].filter((s) => canSeeLocation(req.principal?.locations ?? [], s));
      res.json({ data: Object.fromEntries(await Promise.all(sites.map(async (s) => [s, await statusOfSite(s)]))), status: 'ok' });
    } catch (e) {
      next(e);
    }
  });
  app.use('/api/v3/reporting', reportingRoutes(reporting));
  app.use('/api/v3/executive', executiveRoutes(executive, deps.dashboard));
  app.use('/api/v3/lines', linesRoutes(linesRepo, conmasRepo, deps.dashboard, settingsService));
  app.use('/api/v3/planning', planningRoutes(deps.dashboard));
  app.use('/api/v3/settings', settingsRoutes(deps.dashboard, settingsService));
  app.use('/api/v3/access', accessRoutes(deps.dashboard, { pairingTtlMin: deps.pairingTtlMin }));
  app.use('/api/v3/export', exportRoutes(reporting, executive, deps.dashboard));

  // Web SPA (hash router): file statis + index.html untuk path non-API.
  const webDir = deps.webDistDir ? path.resolve(deps.webDistDir) : undefined;
  if (webDir && existsSync(path.join(webDir, 'index.html'))) {
    app.use(express.static(webDir, { index: 'index.html', maxAge: '1h' }));
    app.get(/^\/(?!api\/|healthz|readyz).*/, (_req, res) => {
      res.sendFile(path.join(webDir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
