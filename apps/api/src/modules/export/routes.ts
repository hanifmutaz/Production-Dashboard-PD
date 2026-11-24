import { EXPORT_DATASET_KEYS, EXPORT_DATASETS, eachDate, type ExportDatasetKey } from '@v3/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { canSeeLocation, principalOf, requirePermission } from '../../http/auth.js';
import { conflict, forbidden, notFound, parseInput } from '../../http/errors.js';
import { isoDate, tempat } from '../../http/schemas.js';
import { withTransaction, type DbPool } from '../../db/pool.js';
import { isUniqueViolation } from '../../db/optimistic.js';
import { recordAudit } from '../audit/auditService.js';
import type { ExecutiveService } from '../executive/executiveService.js';
import type { ReportingService } from '../reporting/reportingService.js';
import { buildExportRows, type ExportFilters } from './exportBuilder.js';
import { renderTable, type Table } from './exportService.js';

const MAX_ROWS = 100_000;

const exportBody = z
  .object({
    ds: z.enum(EXPORT_DATASET_KEYS as [ExportDatasetKey, ...ExportDatasetKey[]]),
    format: z.enum(['xlsx', 'csv-excel', 'csv-standard', 'tsv', 'json']).default('csv-excel'),
    start: isoDate,
    end: isoDate,
    period: z
      .string()
      .regex(/^20\d\d-(0[1-9]|1[0-2])$/)
      .optional(),
    locations: z.array(tempat).min(1).max(3),
    lines: z.string().max(200).default(''),
    shift: z.enum(['all', '1', '2', '3']).default('all'),
    agg: z.enum(['day', 'tot']).default('day'),
    columns: z.array(z.string().max(40)).min(1).max(30),
    name: z
      .string()
      .trim()
      .max(100)
      .regex(/^[A-Za-z0-9 ._-]*$/, 'nama file hanya huruf, angka, spasi, . _ -')
      .default(''),
  })
  .refine((b) => b.start <= b.end, 'start harus ≤ end')
  .refine((b) => eachDate(b.start, b.end).length <= 366, 'rentang maksimal 366 hari');

type Body = z.infer<typeof exportBody>;

function check(req: Request, b: Body): void {
  for (const l of b.locations) if (!canSeeLocation(req.principal?.locations ?? [], l)) throw forbidden('Lokasi di luar cakupan akun Anda');
}

async function buildTable(b: Body, reporting: ReportingService, executive: ExecutiveService): Promise<Table> {
  const filters: ExportFilters = {
    ds: b.ds,
    start: b.start,
    end: b.end,
    period: b.period,
    locations: b.locations,
    lines: b.lines,
    shift: b.shift,
    agg: b.agg,
  };
  const rows = (await buildExportRows(filters, reporting, executive)).slice(0, MAX_ROWS);
  const spec = EXPORT_DATASETS[b.ds].cols as readonly (readonly [string, string, boolean, boolean?])[];
  const cols = b.columns.map((k) => spec.find((c) => c[0] === k)).filter((c): c is (typeof spec)[number] => c !== undefined);
  return { columns: cols.map((c) => c[1]), rows: rows.map((r) => cols.map((c) => r[c[0]] ?? null)) };
}

export function exportRoutes(reporting: ReportingService, executive: ExecutiveService, pool: DbPool): Router {
  const r = Router();
  const can = requirePermission('export.run');

  /** Pratinjau: baris pertama (maks 40) + total baris. Tidak dicatat di audit. */
  r.post('/preview', can, async (req, res, next) => {
    try {
      const b = parseInput(exportBody, req.body);
      check(req, b);
      const table = await buildTable(b, reporting, executive);
      const limit = Math.min(40, Number(req.query['limit'] ?? 8) || 8);
      res.json({ data: { columns: table.columns, rows: table.rows.slice(0, limit), total: table.rows.length }, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  r.post('/', can, async (req, res, next) => {
    try {
      const b = parseInput(exportBody, req.body);
      check(req, b);
      const table = await buildTable(b, reporting, executive);
      const file = await renderTable(table, b.format, EXPORT_DATASETS[b.ds].t);
      await recordAudit(pool, req, {
        action: 'export.run',
        target: b.ds,
        detail: { format: b.format, start: b.start, end: b.end, locations: b.locations, rows: table.rows.length },
      });
      const ext = b.format === 'xlsx' ? 'xlsx' : b.format === 'json' ? 'json' : b.format === 'tsv' ? 'tsv' : 'csv';
      const base = (b.name || `${b.ds}_${b.ds === 'exec' ? (b.period ?? b.start.slice(0, 7)) : `${b.start}_${b.end}`}`).replace(
        /\s+/g,
        '_',
      );
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${base}.${ext}"`);
      res.send(file.body);
    } catch (e) {
      next(e);
    }
  });

  r.get('/templates', can, async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, name, definition, version, updated_at FROM export_templates WHERE owner_id = $1 ORDER BY name`,
        [principalOf(req).id],
      );
      res.json({ data: rows, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  r.post('/templates', can, async (req, res, next) => {
    try {
      const b = parseInput(z.object({ name: z.string().trim().min(1).max(60), definition: z.record(z.string(), z.unknown()) }), req.body);
      const row = await withTransaction(pool, async (tx) => {
        const ins = await tx
          .query(`INSERT INTO export_templates (name, owner_id, definition) VALUES ($1, $2, $3) RETURNING id, name, version`, [
            b.name,
            principalOf(req).id,
            JSON.stringify(b.definition),
          ])
          .catch((err: unknown) => {
            throw isUniqueViolation(err) ? conflict('Nama template sudah dipakai. Pilih template itu atau gunakan nama lain.') : err;
          });
        if (!ins.rows[0]) throw conflict('Nama template sudah dipakai');
        await recordAudit(tx, req, { action: 'export.template.create', target: b.name });
        return ins.rows[0];
      });
      res.status(201).json({ data: row, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  r.put('/templates/:id', can, async (req, res, next) => {
    try {
      const id = parseInput(z.coerce.number().int().positive(), req.params['id']);
      const b = parseInput(z.object({ definition: z.record(z.string(), z.unknown()), version: z.number().int().positive() }), req.body);
      const row = await withTransaction(pool, async (tx) => {
        const upd = await tx.query(
          `UPDATE export_templates SET definition = $3, version = version + 1, updated_at = now() WHERE id = $1 AND owner_id = $2 AND version = $4 RETURNING id, name, version`,
          [id, principalOf(req).id, JSON.stringify(b.definition), b.version],
        );
        if (!upd.rows[0]) throw conflict();
        await recordAudit(tx, req, { action: 'export.template.update', target: String(id) });
        return upd.rows[0];
      });
      res.json({ data: row, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  r.delete('/templates/:id', can, async (req, res, next) => {
    try {
      const id = parseInput(z.coerce.number().int().positive(), req.params['id']);
      await withTransaction(pool, async (tx) => {
        // Hanya pemilik — mencegah akses lintas objek.
        const del = await tx.query(`DELETE FROM export_templates WHERE id = $1 AND owner_id = $2 RETURNING id`, [id, principalOf(req).id]);
        if (!del.rows[0]) throw notFound('Template tidak ada');
        await recordAudit(tx, req, { action: 'export.template.delete', target: String(id) });
      });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return r;
}
