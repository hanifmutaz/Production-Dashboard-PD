import { Router } from 'express';
import { z } from 'zod';
import { canSeeLocation, principalOf, requirePermission } from '../../http/auth.js';
import { isProductionLine } from './lineCodes.js';
import { badRequest, notFound, parseInput } from '../../http/errors.js';
import { lineCode, tempat, versionField } from '../../http/schemas.js';
import { withTransaction, type DbPool } from '../../db/pool.js';
import { saveVersioned } from '../../db/optimistic.js';
import { recordAudit } from '../audit/auditService.js';
import type { ConmasRepository } from '../reporting/conmasRepository.js';
import type { SettingsService } from '../settings/settingsService.js';
import type { LinesRepository } from './linesRepository.js';

export function linesRoutes(repo: LinesRepository, conmas: ConmasRepository, pool: DbPool, settings: SettingsService): Router {
  const r = Router();

  r.get('/', requirePermission('dashboard.view', 'devices.manage'), async (req, res, next) => {
    try {
      const { locations } = principalOf(req);
      const lines = (await repo.listActive()).filter((line) => canSeeLocation(locations, line.location));
      res.json({ data: lines, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  /** Semua line termasuk nonaktif (Settings → Master Produksi → Line). */
  r.get('/all', requirePermission('config.view'), async (req, res, next) => {
    try {
      const { locations } = principalOf(req);
      const lines = (await repo.listAll()).filter((line) => canSeeLocation(locations, line.location));
      res.json({ data: lines, status: 'ok' });
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
          product: z.string().trim().max(130).default(''),
          external_code: z.string().trim().max(130).default(''),
          cycle_time: z.number().positive().max(99999).nullable().default(null),
          version: versionField,
        }),
        req.body,
      );
      if (b.tempat === 'internal' && b.active && !isProductionLine(code)) throw badRequest('Gunakan kode line induk yang berakhir angka.');
      const row = await withTransaction(pool, async (tx) => {
        const saved = await saveVersioned(tx, {
          version: b.version,
          insertSql: `INSERT INTO lines (line_code, description, shift_scheme, location, active, product, external_code, cycle_time)
                      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          insertParams: [code, b.description, b.shift_scheme, b.tempat, b.active, b.product, b.external_code, b.cycle_time],
          updateSql: `UPDATE lines SET description = $2, shift_scheme = $3, location = $4, active = $5, product = $6, external_code = $7, cycle_time = $8,
                      version = version + 1, updated_at = now() WHERE line_code = $1 AND version = $9 RETURNING *`,
          updateParams: [code, b.description, b.shift_scheme, b.tempat, b.active, b.product, b.external_code, b.cycle_time],
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
      const found = (await conmas.distinctLines()).filter((l) => isProductionLine(l) && !known.has(l));
      res.json({ data: found, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  /** Daftarkan line baru hasil discovery. Default skema shift & lokasi dari Settings → line_discovery (OQ-017). */
  r.post('/sync', requirePermission('config.edit'), async (req, res, next) => {
    try {
      const known = new Set((await repo.listAll()).map((l) => l.line_code));
      const found = (await conmas.distinctLines()).filter((l) => isProductionLine(l) && !known.has(l));
      const def = await settings.lineDiscovery();
      await withTransaction(pool, async (tx) => {
        for (const code of found) {
          await tx.query(`INSERT INTO lines (line_code, shift_scheme, location) VALUES ($1, $2, $3) ON CONFLICT (line_code) DO NOTHING`, [
            code,
            def.shift_scheme,
            def.location,
          ]);
        }
        await recordAudit(tx, req, { action: 'lines.sync', detail: { added: found, defaults: def } });
      });
      res.json({ data: { added: found, defaults: def }, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
