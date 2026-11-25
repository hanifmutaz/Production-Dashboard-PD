// Target Produksi (Settings → Target Produksi): target lokasi (tabel targets) + target per line (line_targets).
import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../http/auth.js';
import { parseInput } from '../../http/errors.js';
import { lineCode, month, versionField, year } from '../../http/schemas.js';
import { withTransaction, type DbPool } from '../../db/pool.js';
import { saveVersioned } from '../../db/optimistic.js';
import { recordAudit } from '../audit/auditService.js';
import { serializeTargetRow } from './serialize.js';

export function planningRoutes(pool: DbPool): Router {
  const r = Router();

  r.get('/', requirePermission('dashboard.view'), async (req, res, next) => {
    try {
      const q = parseInput(z.object({ year, month }), req.query);
      const locations = await pool.query(
        `SELECT location, year, month, target, version FROM targets WHERE year = $1 AND month = $2 ORDER BY location`,
        [q.year, q.month],
      );
      const lines = await pool.query(
        `SELECT line_code, year, month, target, work_days, note, version FROM line_targets WHERE year = $1 AND month = $2 ORDER BY line_code`,
        [q.year, q.month],
      );
      res.json({ data: { locations: locations.rows.map(serializeTargetRow), lines: lines.rows.map(serializeTargetRow) }, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  r.put('/line', requirePermission('config.edit'), async (req, res, next) => {
    try {
      const b = parseInput(
        z.object({
          line_code: lineCode,
          year: z.number().int().min(2000).max(2100),
          month: z.number().int().min(1).max(12),
          target: z.number().int().min(0).max(1_000_000_000),
          work_days: z.number().int().min(1).max(31),
          note: z.string().trim().max(130).default(''),
          version: versionField,
        }),
        req.body,
      );
      const userId = req.principal?.id ?? null;
      const row = await withTransaction(pool, async (tx) => {
        const saved = await saveVersioned(tx, {
          version: b.version,
          insertSql: `INSERT INTO line_targets (line_code, year, month, target, work_days, note, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7)
                      RETURNING line_code, year, month, target, work_days, note, version`,
          insertParams: [b.line_code, b.year, b.month, b.target, b.work_days, b.note, userId],
          updateSql: `UPDATE line_targets SET target = $4, work_days = $5, note = $6, updated_by = $7, version = version + 1, updated_at = now()
                      WHERE line_code = $1 AND year = $2 AND month = $3 AND version = $8 RETURNING line_code, year, month, target, work_days, note, version`,
          updateParams: [b.line_code, b.year, b.month, b.target, b.work_days, b.note, userId],
        });
        await recordAudit(tx, req, {
          action: 'planning.line.save',
          target: `${b.line_code}/${b.year}-${b.month}`,
          detail: { target: b.target, work_days: b.work_days },
        });
        return saved;
      });
      res.json({ data: serializeTargetRow(row), status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
