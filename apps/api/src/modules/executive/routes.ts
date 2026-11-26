import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../http/auth.js';
import { badRequest, parseInput } from '../../http/errors.js';
import { isoDate, month, tempat, versionField, year } from '../../http/schemas.js';
import type { DbPool } from '../../db/pool.js';
import { withTransaction } from '../../db/pool.js';
import { saveVersioned } from '../../db/optimistic.js';
import { recordAudit } from '../audit/auditService.js';
import { ExecutiveService, isTempat } from './executiveService.js';

export function executiveRoutes(svc: ExecutiveService, pool: DbPool): Router {
  const r = Router();

  r.get('/month', requirePermission('dashboard.view'), async (req, res, next) => {
    try {
      const q = parseInput(z.object({ year, month }), req.query);
      res.json({ data: await svc.month(q.year, q.month), status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  r.get('/trend', requirePermission('dashboard.view'), async (req, res, next) => {
    try {
      const q = parseInput(z.object({ year, tempat: tempat.optional() }), req.query);
      const t = q.tempat;
      res.json({ data: await svc.trend(q.year, t && isTempat(t) ? t : undefined), status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  r.put('/target', requirePermission('config.edit'), async (req, res, next) => {
    try {
      const b = parseInput(
        z.object({
          year: z.number().int().min(2000).max(2100),
          month: z.number().int().min(1).max(12),
          tempat,
          target: z.number().min(0).finite(),
          version: versionField,
        }),
        req.body,
      );
      const userId = req.principal?.id ?? null;
      const row = await withTransaction(pool, async (tx) => {
        const saved = await saveVersioned(tx, {
          version: b.version,
          insertSql: `INSERT INTO targets (location, year, month, target, updated_by) VALUES ($1, $2, $3, $4, $5) RETURNING location, year, month, target, version`,
          insertParams: [b.tempat, b.year, b.month, b.target, userId],
          updateSql: `UPDATE targets SET target = $4, updated_by = $5, version = version + 1, updated_at = now()
                      WHERE location = $1 AND year = $2 AND month = $3 AND version = $6 RETURNING location, year, month, target, version`,
          updateParams: [b.tempat, b.year, b.month, b.target, userId],
        });
        await recordAudit(tx, req, {
          action: 'executive.target.save',
          target: `${b.tempat}/${b.year}-${b.month}`,
          detail: { target: b.target, version: saved['version'] },
        });
        return saved;
      });
      res.json({ data: row, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  r.get('/calendar', requirePermission('dashboard.view', 'config.view'), async (req, res, next) => {
    try {
      const q = parseInput(z.object({ year, month, tempat }), req.query);
      if (!isTempat(q.tempat)) throw badRequest('tempat tidak valid');
      res.json({ data: await svc.getCalendar(q.tempat, q.year, q.month), status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  r.put('/calendar', requirePermission('config.edit'), async (req, res, next) => {
    try {
      const b = parseInput(
        z.object({
          year: z.number().int().min(2000).max(2100),
          month: z.number().int().min(1).max(12),
          tempat,
          holidays: z.array(isoDate).max(31),
          version: versionField,
        }),
        req.body,
      );
      const holidays = ExecutiveService.validHolidays(b.year, b.month, b.holidays);
      const userId = req.principal?.id ?? null;
      const row = await withTransaction(pool, async (tx) => {
        const saved = await saveVersioned(tx, {
          version: b.version,
          insertSql: `INSERT INTO calendar_exceptions (location, year, month, holidays, updated_by) VALUES ($1, $2, $3, $4, $5) RETURNING location, year, month, holidays, version`,
          insertParams: [b.tempat, b.year, b.month, holidays, userId],
          updateSql: `UPDATE calendar_exceptions SET holidays = $4, updated_by = $5, version = version + 1, updated_at = now()
                      WHERE location = $1 AND year = $2 AND month = $3 AND version = $6 RETURNING location, year, month, holidays, version`,
          updateParams: [b.tempat, b.year, b.month, holidays, userId],
        });
        await recordAudit(tx, req, { action: 'executive.calendar.save', target: `${b.tempat}/${b.year}-${b.month}`, detail: { holidays } });
        return saved;
      });
      res.json({ data: row, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
