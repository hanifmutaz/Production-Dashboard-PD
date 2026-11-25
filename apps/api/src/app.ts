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
import { authenticate, requireAuth } from './http/auth.js';
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
  app.use(helmet());
  app.use(cookieParser());

  const linesRepo = new LinesRepository(deps.dashboard);
  const cols = new ColumnSql(deps.reportColumns, deps.availableColumns, deps.productionModeFrom);
  const conmasRepo = new ConmasRepository(deps.conmas, cols);
  const settingsService = new SettingsService(deps.dashboard, {
    staleThresholdMin: deps.shift.lineNotRunningThresholdMin,
    shift: { ...deps.shift },
  });
  const reporting = new ReportingService(conmasRepo, linesRepo, deps.shift, settingsService, deps.clock);
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
  app.use('/api/v3/reporting', reportingRoutes(reporting, { subcontEnabled: deps.subcontEnabled }));
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
