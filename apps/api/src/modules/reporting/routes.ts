import { daysInMonth } from '@v3/shared';
import { Router } from 'express';
import { z } from 'zod';
import { canSeeLocation, requirePermission } from '../../http/auth.js';
import { forbidden, parseInput } from '../../http/errors.js';
import { isoDate, lineCode, month, rangeQuery, tempat, year } from '../../http/schemas.js';
import type { ReportingService } from './reportingService.js';

const pad2 = (n: number): string => String(n).padStart(2, '0');

export function reportingRoutes(svc: ReportingService, opts: { subcontEnabled: boolean }): Router {
  const r = Router();
  const view = requirePermission('dashboard.view');

  /** SGP/Systech On Hold → status saja, tanpa query & tanpa angka 0. */
  const onHold = (location: string | undefined): boolean => location !== undefined && location !== 'internal' && !opts.subcontEnabled;

  const checkScope = (locations: readonly string[], location: string | undefined): void => {
    if (location && !canSeeLocation(locations, location)) throw forbidden('Lokasi di luar cakupan akun Anda');
  };

  r.get('/line-detail', view, async (req, res, next) => {
    try {
      const q = parseInput(
        z.object({ line: lineCode, date: isoDate.optional(), shift: z.coerce.number().int().min(1).max(3).optional() }),
        req.query,
      );
      const result = await svc.lineDetail(q);
      res.json({
        data: result.data,
        status: result.line_status,
        meta: { shift: result.shift, tanggal: result.tanggal, available_shifts: result.available_shifts },
      });
    } catch (e) {
      next(e);
    }
  });

  r.get('/summary/current', view, async (req, res, next) => {
    try {
      const q = parseInput(z.object({ location: tempat.optional() }), req.query);
      checkScope(req.principal?.locations ?? [], q.location);
      if (onHold(q.location)) return void res.json({ data: null, status: 'on_hold' });
      res.json({ data: await svc.currentShiftSummary(q.location ?? 'internal'), status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  r.get('/summary/daily', view, async (req, res, next) => {
    try {
      const q = parseInput(z.object({ date: isoDate, location: tempat.optional() }), req.query);
      checkScope(req.principal?.locations ?? [], q.location);
      if (onHold(q.location)) return void res.json({ data: null, status: 'on_hold' });
      const s = await svc.rangeSummary(q.date, q.date, q.location ?? 'internal');
      res.json({ data: s.hasData ? s : null, status: s.hasData ? 'ok' : 'no_data' });
    } catch (e) {
      next(e);
    }
  });

  r.get('/summary/monthly', view, async (req, res, next) => {
    try {
      const q = parseInput(z.object({ year, month, location: tempat.optional() }), req.query);
      checkScope(req.principal?.locations ?? [], q.location);
      if (onHold(q.location)) return void res.json({ data: null, status: 'on_hold' });
      const start = `${q.year}-${pad2(q.month)}-01`;
      const end = `${q.year}-${pad2(q.month)}-${pad2(daysInMonth(q.year, q.month))}`;
      const s = await svc.rangeSummary(start, end, q.location ?? 'internal');
      res.json({ data: s.hasData ? s : null, status: s.hasData ? 'ok' : 'no_data' });
    } catch (e) {
      next(e);
    }
  });

  r.get('/trend/range', view, async (req, res, next) => {
    try {
      const q = parseInput(rangeQuery, req.query);
      checkScope(req.principal?.locations ?? [], q.location);
      if (onHold(q.location)) return void res.json({ data: null, status: 'on_hold' });
      res.json({
        data: await svc.rangeTrend(q.start, q.end, { location: q.location ?? 'internal', ...(q.line ? { line: q.line } : {}) }),
        status: 'ok',
      });
    } catch (e) {
      next(e);
    }
  });

  r.get('/breakdown', view, async (req, res, next) => {
    try {
      const q = parseInput(rangeQuery, req.query);
      checkScope(req.principal?.locations ?? [], q.location);
      if (onHold(q.location)) return void res.json({ data: null, status: 'on_hold' });
      res.json({ data: await svc.lineRangeBreakdown(q.start, q.end, q.location ?? 'internal'), status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  r.get('/reject', requirePermission('dashboard.view'), async (req, res, next) => {
    try {
      const q = parseInput(rangeQuery, req.query);
      checkScope(req.principal?.locations ?? [], q.location);
      if (onHold(q.location)) return void res.json({ data: null, status: 'on_hold' });
      const items = await svc.rejectDetail(q.start, q.end, { location: q.location ?? 'internal', ...(q.line ? { line: q.line } : {}) });
      res.json({ data: items, status: items.length ? 'ok' : 'no_data' });
    } catch (e) {
      next(e);
    }
  });

  r.get('/stoptime', view, async (req, res, next) => {
    try {
      const q = parseInput(rangeQuery, req.query);
      checkScope(req.principal?.locations ?? [], q.location);
      if (onHold(q.location)) return void res.json({ data: null, status: 'on_hold' });
      const data = await svc.stoptimeDetail(q.start, q.end, { location: q.location ?? 'internal', ...(q.line ? { line: q.line } : {}) });
      res.json({ data, status: data.events.length ? 'ok' : 'no_data' });
    } catch (e) {
      next(e);
    }
  });

  r.get('/reports', requirePermission('dashboard.investigate'), async (req, res, next) => {
    try {
      const q = parseInput(rangeQuery, req.query);
      checkScope(req.principal?.locations ?? [], q.location);
      if (onHold(q.location)) return void res.json({ data: null, status: 'on_hold' });
      const data = await svc.reportsForMonth(q.start, q.end, q.location ?? 'internal');
      res.json({
        data,
        status: data.length ? 'ok' : 'no_data',
        meta: { units: { stoptime: 'menit' }, pending: ['satuan sogo/shugyo/kikai belum dikonfirmasi'] },
      });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
