import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../http/auth.js';
import { notFound, parseInput } from '../../http/errors.js';
import { lineCode, tempat, versionField } from '../../http/schemas.js';
import { withTransaction, type DbPool } from '../../db/pool.js';
import { saveVersioned } from '../../db/optimistic.js';
import { recordAudit } from '../audit/auditService.js';
import type { ConmasRepository } from '../reporting/conmasRepository.js';
import type { LinesRepository } from './linesRepository.js';

export function linesRoutes(repo: LinesRepository, conmas: ConmasRepository, pool: DbPool): Router {
  const r = Router();

  r.get('/', requirePermission('dashboard.view'), async (_req, res, next) => {
    try {
      res.json({ data: await repo.listActive(), status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  r.put('/:line_code', requirePermission('config.edit'), async (req, res, next) => {
    try {
      const code = parseInput(lineCode, req.params['line_code']);
      const b = parseInput(
        z.object({
          description: z.string().max(200).default(''),
          shift_scheme: z.union([z.literal(2), z.literal(3)]),
          tempat,
          active: z.boolean().default(true),
          version: versionField,
        }),
        req.body,
      );
      const row = await withTransaction(pool, async (tx) => {
        const saved = await saveVersioned(tx, {
          version: b.version,
          insertSql: `INSERT INTO lines (line_code, description, shift_scheme, location, active) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          insertParams: [code, b.description, b.shift_scheme, b.tempat, b.active],
          updateSql: `UPDATE lines SET description = $2, shift_scheme = $3, location = $4, active = $5, version = version + 1, updated_at = now()
                      WHERE line_code = $1 AND version = $6 RETURNING *`,
          updateParams: [code, b.description, b.shift_scheme, b.tempat, b.active],
        });
        await recordAudit(tx, req, { action: 'lines.save', target: code, detail: { ...b } });
        return saved;
      });
      res.json({ data: row, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  /** DELETE = nonaktifkan (data historis tetap). */
  r.delete('/:line_code', requirePermission('config.edit'), async (req, res, next) => {
    try {
      const code = parseInput(lineCode, req.params['line_code']);
      await withTransaction(pool, async (tx) => {
        const { rowCount } = await tx.query(
          `UPDATE lines SET active = false, version = version + 1, updated_at = now() WHERE line_code = $1`,
          [code],
        );
        if (!rowCount) throw notFound(`Line ${code} tidak ada`);
        await recordAudit(tx, req, { action: 'lines.deactivate', target: code });
      });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  r.get('/discover', requirePermission('config.edit'), async (_req, res, next) => {
    try {
      const known = new Set((await repo.listAll()).map((l) => l.line_code));
      const found = (await conmas.distinctLines()).filter((l) => /^[A-Za-z0-9_-]+$/.test(l) && !known.has(l));
      res.json({ data: found, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  /** Daftarkan line baru hasil discovery (default 2 shift, internal). Line yang sudah ada tidak diubah. */
  r.post('/sync', requirePermission('config.edit'), async (req, res, next) => {
    try {
      const known = new Set((await repo.listAll()).map((l) => l.line_code));
      const found = (await conmas.distinctLines()).filter((l) => /^[A-Za-z0-9_-]+$/.test(l) && !known.has(l));
      await withTransaction(pool, async (tx) => {
        for (const code of found) {
          await tx.query(
            `INSERT INTO lines (line_code, shift_scheme, location) VALUES ($1, 2, 'internal') ON CONFLICT (line_code) DO NOTHING`,
            [code],
          );
        }
        await recordAudit(tx, req, { action: 'lines.sync', detail: { added: found } });
      });
      res.json({ data: { added: found }, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
