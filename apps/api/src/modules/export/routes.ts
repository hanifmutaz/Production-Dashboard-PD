import { Router } from 'express';
import { z } from 'zod';
import { canSeeLocation, principalOf, requirePermission } from '../../http/auth.js';
import { AppError, conflict, forbidden, notFound, parseInput } from '../../http/errors.js';
import { isoDate, tempat } from '../../http/schemas.js';
import { withTransaction, type DbPool } from '../../db/pool.js';
import { isUniqueViolation } from '../../db/optimistic.js';
import { recordAudit } from '../audit/auditService.js';
import type { ReportingService } from '../reporting/reportingService.js';
import { renderTable, selectColumns, type Table } from './exportService.js';

const exportBody = z
  .object({
    dataset: z.enum(['breakdown', 'trend', 'reject', 'stoptime']),
    format: z.enum(['xlsx', 'csv', 'tsv', 'json']),
    start: isoDate,
    end: isoDate,
    location: tempat.default('internal'),
    columns: z.array(z.string().max(60)).max(100).optional(),
  })
  .refine((b) => b.start <= b.end, 'start harus ≤ end');

async function buildTable(svc: ReportingService, b: z.infer<typeof exportBody>): Promise<Table> {
  if (b.dataset === 'breakdown') {
    const d = await svc.lineRangeBreakdown(b.start, b.end, b.location);
    return {
      columns: ['line', 'produk', 'lokasi', 'plan', 'actual', 'reject_m107', 'bekidoritsu', 'deviasi_plan_minus_actual', ...d.dates],
      rows: d.lines.map((l) => [
        l.line_code,
        l.product_name,
        l.tempat,
        l.output_plan,
        l.output_actual,
        l.qty_reject,
        l.bekidoritsu,
        l.deviasi,
        ...l.days.map((x) => (x.hasData ? x.actual : null)),
      ]),
    };
  }
  if (b.dataset === 'trend') {
    const t = await svc.rangeTrend(b.start, b.end, { location: b.location });
    return {
      columns: ['tanggal', 'plan', 'actual', 'stoptime', 'ada_data'],
      rows: t.days.map((d) => [d.date, d.hasData ? d.plan : null, d.hasData ? d.actual : null, d.hasData ? d.stoptime : null, d.hasData]),
    };
  }
  if (b.dataset === 'reject') {
    const items = await svc.rejectDetail(b.start, b.end, { location: b.location });
    return { columns: ['nama_reject', 'qty'], rows: items.map((i) => [i.name, i.qty]) };
  }
  const s = await svc.stoptimeDetail(b.start, b.end, { location: b.location });
  return {
    columns: ['line', 'tanggal', 'kategori', 'masalah', 'menit'],
    rows: s.events.map((e) => [e.line, e.date, e.kategori, e.masalah, e.minute]),
  };
}

export function exportRoutes(svc: ReportingService, pool: DbPool, opts: { subcontEnabled: boolean }): Router {
  const r = Router();
  const can = requirePermission('export.run');

  r.post('/', can, async (req, res, next) => {
    try {
      const b = parseInput(exportBody, req.body);
      if (!canSeeLocation(req.principal?.locations ?? [], b.location)) throw forbidden('Lokasi di luar cakupan akun Anda');
      if (b.location !== 'internal' && !opts.subcontEnabled) throw new AppError(422, 'LOCATION_ON_HOLD', 'Lokasi ini sedang On Hold');
      const table = selectColumns(await buildTable(svc, b), b.columns);
      const file = await renderTable(table, b.format, b.dataset);
      await recordAudit(pool, req, {
        action: 'export.run',
        target: b.dataset,
        detail: { format: b.format, start: b.start, end: b.end, location: b.location, rows: table.rows.length },
      });
      const filename = `${b.dataset}_${b.location}_${b.start}_${b.end}.${b.format}`;
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
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
      const b = parseInput(z.object({ name: z.string().trim().min(1).max(80), definition: z.record(z.string(), z.unknown()) }), req.body);
      const row = await withTransaction(pool, async (tx) => {
        const ins = await tx
          .query(`INSERT INTO export_templates (name, owner_id, definition) VALUES ($1, $2, $3) RETURNING id, name, version`, [
            b.name,
            principalOf(req).id,
            JSON.stringify(b.definition),
          ])
          .catch((err: unknown) => {
            throw isUniqueViolation(err) ? conflict('Nama template sudah dipakai') : err;
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
