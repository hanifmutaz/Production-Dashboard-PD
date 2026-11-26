import { Router } from 'express';
import { seriesFromProductName } from '@v3/shared';
import { z } from 'zod';
import { canSeeLocation, principalOf, requirePermission } from '../../http/auth.js';
import { isProductionLine } from './lineCodes.js';
import { badRequest, notFound, parseInput } from '../../http/errors.js';
import { lineCode, tempat, versionField } from '../../http/schemas.js';
import { withTransaction, type DbPool } from '../../db/pool.js';
import { saveVersioned } from '../../db/optimistic.js';
import { recordAudit } from '../audit/auditService.js';
import type { ConmasRepository } from '../reporting/conmasRepository.js';
import { activeProduct } from '../reporting/reportingService.js';
import type { SettingsService } from '../settings/settingsService.js';
import type { LineRecord, LinesRepository } from './linesRepository.js';

/** Series jarang berubah → cukup disegarkan berkala, bukan tiap request (view ConMas lebar). */
const SERIES_TTL_MS = 10 * 60_000;
const SERIES_RETRY_MS = 30_000;

export function linesRoutes(repo: LinesRepository, conmas: ConmasRepository, pool: DbPool, settings: SettingsService): Router {
  const r = Router();

  // Series otomatis dari nama produk terbaru di ConMas (kode line → series). Gagal baca ConMas tidak boleh menggagalkan daftar line.
  let seriesCache: { readonly map: ReadonlyMap<string, string>; readonly expires: number } | null = null;
  let seriesLoading: Promise<ReadonlyMap<string, string>> | null = null;
  const loadSeries = async (): Promise<ReadonlyMap<string, string>> => {
    if (seriesCache && seriesCache.expires > Date.now()) return seriesCache.map;
    seriesLoading ??= (async () => {
      try {
        const codes = (await repo.listAll()).filter((l) => l.location === 'internal').map((l) => l.line_code);
        const latest = await conmas.fetchLatestRowPerLine(codes);
        const map = new Map<string, string>();
        for (const row of latest) {
          // Produk aktif = slot terakhir yang terisi; bila tidak ada, pakai nama produk terisi terakhir di report itu.
          const name = activeProduct(row.products)?.product_name ?? [...row.products].reverse().find((p) => p.product_name)?.product_name;
          const series = seriesFromProductName(name);
          if (series) map.set(row.line, series);
        }
        seriesCache = { map, expires: Date.now() + SERIES_TTL_MS };
      } catch {
        seriesCache = { map: seriesCache?.map ?? new Map(), expires: Date.now() + SERIES_RETRY_MS };
      }
      return seriesCache.map;
    })().finally(() => {
      seriesLoading = null;
    });
    return seriesLoading;
  };
  /** `product` = isian manual (tetap ada untuk form edit). `series` = isian manual bila ada, kalau kosong dari ConMas. */
  const withSeries = async (lines: readonly LineRecord[]): Promise<(LineRecord & { series: string })[]> => {
    const auto = lines.some((l) => l.product === '') ? await loadSeries() : new Map<string, string>();
    return lines.map((l) => ({ ...l, series: l.product || auto.get(l.line_code) || '' }));
  };

  r.get('/', requirePermission('dashboard.view', 'devices.manage'), async (req, res, next) => {
    try {
      const { locations } = principalOf(req);
      const lines = (await repo.listActive()).filter((line) => canSeeLocation(locations, line.location));
      res.json({ data: await withSeries(lines), status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  /** Semua line termasuk nonaktif (Settings → Master Produksi → Line). */
  r.get('/all', requirePermission('config.view'), async (req, res, next) => {
    try {
      const { locations } = principalOf(req);
      const lines = (await repo.listAll()).filter((line) => canSeeLocation(locations, line.location));
      res.json({ data: await withSeries(lines), status: 'ok' });
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
