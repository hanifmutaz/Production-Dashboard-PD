import { daysInMonth } from '@v3/shared';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { canSeeLocation, requirePermission } from '../../http/auth.js';
import { forbidden, parseInput } from '../../http/errors.js';
import { isoDate, lineCode, month, rangeQuery, tempat, year } from '../../http/schemas.js';
import type { ReportingService } from './reportingService.js';

const pad2 = (n: number): string => String(n).padStart(2, '0');

export function reportingRoutes(root: ReportingService): Router {
  const r = Router();
  const view = requirePermission('dashboard.view');

  async function resolve(
    req: Request,
    res: Response,
    q: {
      line?: string | undefined;
      location?: string | undefined;
      date?: string | undefined;
      start?: string | undefined;
      end?: string | undefined;
      year?: number;
      month?: number;
    },
  ) {
    const location = q.line ? await root.lineSite(q.line) : (q.location ?? 'internal');
    if ((q.location && location !== q.location) || !canSeeLocation(req.principal?.locations ?? [], location))
      throw forbidden('Lokasi di luar cakupan akun Anda');
    const month = q.year && q.month ? q.year + '-' + pad2(q.month) : undefined;
    const status = await root.statusOfSite(
      location,
      q.date ?? q.start ?? (month && month + '-01'),
      q.date ?? q.end ?? (q.year && q.month ? month + '-' + pad2(daysInMonth(q.year, q.month)) : undefined),
    );
    if (status !== 'ok') {
      res.json({ data: null, status });
      return null;
    }
    return { svc: await root.forSite(location), location };
  }

  r.get('/line-detail', view, async (req, res, next) => {
    try {
      const q = parseInput(
        z.object({ line: lineCode, date: isoDate.optional(), shift: z.coerce.number().int().min(1).max(3).optional() }),
        req.query,
      );
      const resolved = await resolve(req, res, q);
      if (!resolved) return;
      const { svc } = resolved;
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
      const resolved = await resolve(req, res, q);
      if (!resolved) return;
      const { svc, location } = resolved;
      res.json({ data: await svc.currentShiftSummary(location), status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  r.get('/summary/daily', view, async (req, res, next) => {
    try {
      const q = parseInput(z.object({ date: isoDate, location: tempat.optional() }), req.query);
      const resolved = await resolve(req, res, q);
      if (!resolved) return;
      const { svc, location } = resolved;
      const s = await svc.rangeSummary(q.date, q.date, location);
      res.json({ data: s.hasData ? s : null, status: s.hasData ? 'ok' : 'no_data' });
    } catch (e) {
      next(e);
    }
  });

  r.get('/summary/monthly', view, async (req, res, next) => {
    try {
      const q = parseInput(z.object({ year, month, location: tempat.optional() }), req.query);
      const resolved = await resolve(req, res, q);
      if (!resolved) return;
      const { svc, location } = resolved;
      const start = `${q.year}-${pad2(q.month)}-01`;
      const end = `${q.year}-${pad2(q.month)}-${pad2(daysInMonth(q.year, q.month))}`;
      const s = await svc.rangeSummary(start, end, location);
      res.json({ data: s.hasData ? s : null, status: s.hasData ? 'ok' : 'no_data' });
    } catch (e) {
      next(e);
    }
  });

  r.get('/summary/range', view, async (req, res, next) => {
    try {
      const q = parseInput(rangeQuery, req.query);
      const resolved = await resolve(req, res, q);
      if (!resolved) return;
      const { svc, location } = resolved;
      const s = await svc.rangeSummary(q.start, q.end, location);
      res.json({ data: s.hasData ? s : null, status: s.hasData ? 'ok' : 'no_data' });
    } catch (e) {
      next(e);
    }
  });

  r.get('/line-metrics', view, async (req, res, next) => {
    try {
      const q = parseInput(rangeQuery, req.query);
      const perDay = req.query['perDay'] === '1';
      const resolved = await resolve(req, res, q);
      if (!resolved) return;
      const { svc, location } = resolved;
      const out = await svc.lineMetrics(q.start, q.end, {
        location,
        perDay,
        ...(q.line ? { line: q.line } : {}),
      });
      res.json({ data: out, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  r.get('/trend/range', view, async (req, res, next) => {
    try {
      const q = parseInput(rangeQuery, req.query);
      const resolved = await resolve(req, res, q);
      if (!resolved) return;
      const { svc, location } = resolved;
      res.json({
        data: await svc.rangeTrend(q.start, q.end, { location, ...(q.line ? { line: q.line } : {}) }),
        status: 'ok',
      });
    } catch (e) {
      next(e);
    }
  });

  r.get('/breakdown', view, async (req, res, next) => {
    try {
      const q = parseInput(rangeQuery, req.query);
      const resolved = await resolve(req, res, q);
      if (!resolved) return;
      const { svc, location } = resolved;
      res.json({ data: await svc.lineRangeBreakdown(q.start, q.end, location), status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  r.get('/reject', requirePermission('dashboard.view'), async (req, res, next) => {
    try {
      const q = parseInput(rangeQuery, req.query);
      const resolved = await resolve(req, res, q);
      if (!resolved) return;
      const { svc, location } = resolved;
      const items = await svc.rejectDetail(q.start, q.end, { location, ...(q.line ? { line: q.line } : {}) });
      res.json({ data: items, status: items.length ? 'ok' : 'no_data' });
    } catch (e) {
      next(e);
    }
  });

  r.get('/stoptime', view, async (req, res, next) => {
    try {
      const q = parseInput(rangeQuery, req.query);
      const resolved = await resolve(req, res, q);
      if (!resolved) return;
      const { svc, location } = resolved;
      const data = await svc.stoptimeDetail(q.start, q.end, { location, ...(q.line ? { line: q.line } : {}) });
      res.json({ data, status: data.events.length ? 'ok' : 'no_data' });
    } catch (e) {
      next(e);
    }
  });

  r.get('/reports', requirePermission('dashboard.investigate'), async (req, res, next) => {
    try {
      const q = parseInput(rangeQuery, req.query);
      const resolved = await resolve(req, res, q);
      if (!resolved) return;
      const { svc, location } = resolved;
      const data = await svc.reportsForMonth(q.start, q.end, location, q.line);
      res.json({
        data,
        status: data.length ? 'ok' : 'no_data',
        meta: { units: { stoptime: 'menit', sogo: 'menit', shugyo: 'menit', kikai: 'menit' } },
      });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
