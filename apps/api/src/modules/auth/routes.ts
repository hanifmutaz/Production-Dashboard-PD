import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { SESSION_COOKIE, principalOf, requireAuth } from '../../http/auth.js';
import { AppError, parseInput } from '../../http/errors.js';
import { withTransaction, type DbPool } from '../../db/pool.js';
import { recordAudit } from '../audit/auditService.js';
import type { AuthService } from './authService.js';
import { hashToken, newToken } from './tokens.js';

export function authRoutes(auth: AuthService, pool: DbPool, opts: { cookieSecure: boolean }): Router {
  const r = Router();
  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });

  r.post('/login', loginLimiter, async (req, res, next) => {
    try {
      const b = parseInput(z.object({ username: z.string().min(1).max(60), password: z.string().min(1).max(200) }), req.body);
      const { token, expiresAt, principal } = await auth.login(b.username, b.password, req);
      res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: opts.cookieSecure, expires: expiresAt, path: '/' });
      res.json({
        data: { name: principal.name, role: principal.roleCode, permissions: [...principal.permissions], locations: principal.locations },
        status: 'ok',
      });
    } catch (e) {
      next(e);
    }
  });

  r.post('/logout', requireAuth, async (req, res, next) => {
    try {
      const token = (req as { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
      if (token) await auth.logout(token);
      await recordAudit(pool, req, { action: 'auth.logout' });
      res.clearCookie(SESSION_COOKIE, { path: '/' });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  r.get('/me', requireAuth, (req, res) => {
    const p = principalOf(req);
    res.json({
      data: { kind: p.kind, name: p.name, role: p.roleCode, permissions: [...p.permissions], locations: p.locations },
      status: 'ok',
    });
  });

  /**
   * Pairing iPad: kode sekali pakai & kedaluwarsa (INV-005). Konsumsi atomik:
   * UPDATE ... WHERE consumed_at IS NULL AND expires_at > now() — dua request bersamaan, hanya satu yang dapat baris.
   */
  r.post('/pair', rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false }), async (req, res, next) => {
    try {
      const b = parseInput(
        z.object({
          code: z
            .string()
            .trim()
            .toUpperCase()
            .regex(/^[A-Z2-9]{8}$/),
          name: z.string().trim().min(1).max(80),
        }),
        req.body,
      );
      const token = newToken();
      const device = await withTransaction(pool, async (tx) => {
        const { rows } = await tx.query(
          `UPDATE device_pairing_codes SET consumed_at = now()
           WHERE code_hash = $1 AND consumed_at IS NULL AND expires_at > now() RETURNING id, location`,
          [hashToken(b.code)],
        );
        const code = rows[0];
        if (!code) throw new AppError(422, 'PAIRING_INVALID', 'Kode pairing tidak valid, sudah dipakai, atau kedaluwarsa');
        const created = await tx.query(
          `INSERT INTO devices (name, token_hash, location) VALUES ($1, $2, $3) RETURNING id, name, location`,
          [b.name, hashToken(token), code['location'] ?? null],
        );
        const d = created.rows[0];
        if (!d) throw new AppError(500, 'INTERNAL', 'Gagal membuat perangkat');
        await tx.query(`UPDATE device_pairing_codes SET device_id = $1 WHERE id = $2`, [d['id'], code['id']]);
        await recordAudit(tx, req, { action: 'device.paired', target: String(d['id']), detail: { name: b.name } });
        return d;
      });
      // Token hanya ditampilkan sekali; disimpan di perangkat.
      res.status(201).json({ data: { device, token }, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
