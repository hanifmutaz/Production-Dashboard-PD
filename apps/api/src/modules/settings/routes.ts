import { Router } from 'express';
import { hasAllLocations } from '@v3/shared';
import { z } from 'zod';
import { canSeeLocation, principalOf, requirePermission } from '../../http/auth.js';
import { forbidden, parseInput } from '../../http/errors.js';
import { versionField } from '../../http/schemas.js';
import { withTransaction, type DbPool } from '../../db/pool.js';
import { saveVersioned } from '../../db/optimistic.js';
import { recordAudit } from '../audit/auditService.js';
import { STRICT_SETTINGS, type SettingsService } from './settingsService.js';

// Kunci section mengikuti SETTINGS_SECTIONS mockup (lihat docs/MOCKUP_INVENTORY.md).
const settingKey = z.string().regex(/^[a-z][a-z0-9_.-]{1,60}$/);

/** Settings global dipakai bersama, tetapi data lokasi lain tidak dikirim ke klien. */
function visibleSettings(rows: Record<string, unknown>[], locations: readonly string[]): Record<string, unknown>[] {
  if (hasAllLocations(locations)) return rows;
  return rows.flatMap((row) => {
    const key = String(row['key']);
    if (key.startsWith('shift.')) return locations.includes(key.slice(6)) ? [row] : [];
    if (key === 'config.kpi' || key === 'line_status') return [row];
    const value = z.record(z.string(), z.unknown()).safeParse(row['value']);
    if (!value.success) return [];
    if (key === 'config.general')
      return [{ ...row, value: { name: value.data['name'], department: value.data['department'] } }];
    if (key === 'config.display') {
      const { kioskLine: _kioskLine, ...rest } = value.data;
      void _kioskLine;
      return [{ ...row, value: rest }];
    }
    if (key === 'config.alerts' || key === 'config.machines') {
      const list = z.array(z.record(z.string(), z.unknown())).safeParse(value.data['rows']);
      if (!list.success) return [];
      return [{
        ...row,
        value: { rows: list.data.filter((item) => locations.includes(String(item['site'])) || (key === 'config.alerts' && !item['site'])) },
      }];
    }
    return [];
  });
}

export function settingsRoutes(pool: DbPool, svc: SettingsService): Router {
  const r = Router();

  r.get('/runtime', requirePermission('dashboard.view'), async (req, res, next) => {
    try {
      const screen = req.principal?.screen;
      const includeMachines = screen !== 'hub' && screen !== 'executive';
      const { rows } = await pool.query(
        `SELECT key, value, version, updated_at FROM settings
         WHERE key IN ('config.general', 'config.display', 'config.kpi', 'config.alerts')
            OR (key = 'config.machines' AND $1::boolean)
         ORDER BY key`,
        [includeMachines],
      );
      res.json({ data: visibleSettings(rows, principalOf(req).locations), status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  r.get('/', requirePermission('config.view'), async (req, res, next) => {
    try {
      const { rows } = await pool.query('SELECT key, value, version, updated_at FROM settings ORDER BY key');
      res.json({ data: visibleSettings(rows, principalOf(req).locations), status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  /** Nilai efektif settings yang dipakai logika (termasuk default bila belum pernah disimpan). */
  r.get('/effective', requirePermission('config.view'), async (req, res, next) => {
    try {
      res.json({
        data: {
          line_status: await svc.lineStatus(),
          ...(hasAllLocations(principalOf(req).locations) ? { line_discovery: await svc.lineDiscovery() } : {}),
          shift: svc.shiftConfig(),
        },
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
      const { locations } = principalOf(req);
      if (key.startsWith('shift.')) {
        if (!canSeeLocation(locations, key.slice(6))) throw forbidden();
      } else if (!hasAllLocations(locations)) throw forbidden();
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
