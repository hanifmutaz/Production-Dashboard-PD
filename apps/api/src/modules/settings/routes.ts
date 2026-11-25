import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../http/auth.js';
import { parseInput } from '../../http/errors.js';
import { versionField } from '../../http/schemas.js';
import { withTransaction, type DbPool } from '../../db/pool.js';
import { saveVersioned } from '../../db/optimistic.js';
import { recordAudit } from '../audit/auditService.js';
import { STRICT_SETTINGS, type SettingsService } from './settingsService.js';

// Kunci section mengikuti SETTINGS_SECTIONS mockup (lihat docs/MOCKUP_INVENTORY.md).
const settingKey = z.string().regex(/^[a-z][a-z0-9_.-]{1,60}$/);

export function settingsRoutes(pool: DbPool, svc: SettingsService): Router {
  const r = Router();

  r.get('/', requirePermission('dashboard.view'), async (req, res, next) => {
    try {
      const screen = req.principal?.screen;
      const filter =
        screen === 'hub' || screen === 'executive'
          ? " WHERE key IN ('config.general', 'config.display', 'config.kpi', 'config.alerts')"
          : '';
      const { rows } = await pool.query(`SELECT key, value, version, updated_at FROM settings${filter} ORDER BY key`);
      res.json({ data: rows, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  /** Nilai efektif settings yang dipakai logika (termasuk default bila belum pernah disimpan). */
  r.get('/effective', requirePermission('dashboard.view'), async (_req, res, next) => {
    try {
      res.json({
        data: { line_status: await svc.lineStatus(), line_discovery: await svc.lineDiscovery(), shift: svc.shiftConfig() },
        status: 'ok',
      });
    } catch (e) {
      next(e);
    }
  });

  r.put('/:key', requirePermission('config.edit'), async (req, res, next) => {
    try {
      const key = parseInput(settingKey, req.params['key']);
      const b = parseInput(z.object({ value: z.record(z.string(), z.unknown()), version: versionField }), req.body);
      const strict = STRICT_SETTINGS[key];
      const value = strict ? parseInput(strict, b.value) : b.value;
      const json = JSON.stringify(value);
      if (json.length > 64_000) throw new Error('settings terlalu besar');
      const row = await withTransaction(pool, async (tx) => {
        const saved = await saveVersioned(tx, {
          version: b.version,
          insertSql: `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2, $3) RETURNING key, value, version`,
          insertParams: [key, json, req.principal?.id ?? null],
          updateSql: `UPDATE settings SET value = $2, updated_by = $3, version = version + 1, updated_at = now() WHERE key = $1 AND version = $4 RETURNING key, value, version`,
          updateParams: [key, json, req.principal?.id ?? null],
        });
        await recordAudit(tx, req, { action: 'settings.save', target: key });
        return saved;
      });
      res.json({ data: row, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
