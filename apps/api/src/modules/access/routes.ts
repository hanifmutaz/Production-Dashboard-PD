import { Router } from 'express';
import { z } from 'zod';
import { principalOf, requirePermission } from '../../http/auth.js';
import { badRequest, conflict, forbidden, notFound, parseInput } from '../../http/errors.js';
import { ALL_PERMISSIONS, type Permission } from '../../http/types.js';
import { tempat, versionField } from '../../http/schemas.js';
import { withTransaction, type DbPool } from '../../db/pool.js';
import { isUniqueViolation } from '../../db/optimistic.js';
import { listAudit, recordAudit } from '../audit/auditService.js';
import { AuthService } from '../auth/authService.js';
import { hashToken, newPairingCode } from '../auth/tokens.js';

const permission = z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]]);
const menu = z.string().regex(/^[a-z0-9_-]{1,40}$/);
const password = z.string().min(10, 'password minimal 10 karakter').max(200);

export function accessRoutes(pool: DbPool, opts: { pairingTtlMin: number }): Router {
  const r = Router();
  const manageUsers = requirePermission('users.manage');
  const manageDevices = requirePermission('devices.manage');

  // ---- Roles (bawaan + Custom Role) ----
  r.get('/roles', manageUsers, async (_req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT id, code, name, is_builtin, version FROM roles ORDER BY id`);
      const perms = await pool.query(`SELECT role_id, permission FROM role_permissions`);
      const menus = await pool.query(`SELECT role_id, menu FROM role_menus`);
      res.json({
        data: rows.map((role) => ({
          ...role,
          permissions: perms.rows.filter((p) => p['role_id'] === role['id']).map((p) => p['permission']),
          menus: menus.rows.filter((m) => m['role_id'] === role['id']).map((m) => m['menu']),
        })),
        status: 'ok',
      });
    } catch (e) {
      next(e);
    }
  });

  r.put('/roles/:code', manageUsers, async (req, res, next) => {
    try {
      const code = parseInput(z.string().regex(/^[a-z0-9_-]{2,40}$/), req.params['code']);
      const b = parseInput(
        z.object({
          name: z.string().min(1).max(60),
          permissions: z.array(permission).max(20),
          menus: z.array(menu).max(50),
          version: versionField,
        }),
        req.body,
      );
      const role = await withTransaction(pool, async (tx) => {
        const existing = (await tx.query(`SELECT id, is_builtin, version FROM roles WHERE code = $1`, [code])).rows[0];
        if (existing?.['is_builtin'] === true) throw forbidden('Role bawaan tidak bisa diubah');
        let id: number;
        if (!existing) {
          if (b.version !== undefined) throw notFound('Role tidak ada');
          id = Number((await tx.query(`INSERT INTO roles (code, name) VALUES ($1, $2) RETURNING id`, [code, b.name])).rows[0]?.['id']);
        } else {
          const upd = await tx.query(
            `UPDATE roles SET name = $2, version = version + 1, updated_at = now() WHERE code = $1 AND version = $3 RETURNING id`,
            [code, b.name, b.version ?? -1],
          );
          if (!upd.rows[0]) throw conflict();
          id = Number(upd.rows[0]['id']);
        }
        await tx.query(`DELETE FROM role_permissions WHERE role_id = $1`, [id]);
        for (const p of new Set(b.permissions))
          await tx.query(`INSERT INTO role_permissions (role_id, permission) VALUES ($1, $2)`, [id, p]);
        await tx.query(`DELETE FROM role_menus WHERE role_id = $1`, [id]);
        for (const m of new Set(b.menus)) await tx.query(`INSERT INTO role_menus (role_id, menu) VALUES ($1, $2)`, [id, m]);
        await recordAudit(tx, req, { action: 'role.save', target: code, detail: { permissions: b.permissions, menus: b.menus } });
        return { id, code };
      });
      res.json({ data: role, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  // ---- Users ----
  r.get('/users', manageUsers, async (_req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT u.id, u.username, u.display_name, r.code AS role, u.active, u.locked_until, u.version,
           COALESCE((SELECT array_agg(location ORDER BY location) FROM user_site_scope s WHERE s.user_id = u.id), '{}') AS locations
         FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.username`,
      );
      res.json({ data: rows, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  r.post('/users', manageUsers, async (req, res, next) => {
    try {
      const b = parseInput(
        z.object({
          username: z.string().regex(/^[A-Za-z0-9._-]{3,60}$/),
          display_name: z.string().min(1).max(80),
          password,
          role: z.string(),
          locations: z.array(tempat).max(3).default([]),
        }),
        req.body,
      );
      const hash = await AuthService.hashPassword(b.password);
      const user = await withTransaction(pool, async (tx) => {
        const role = (await tx.query(`SELECT id FROM roles WHERE code = $1`, [b.role])).rows[0];
        if (!role) throw badRequest('Role tidak dikenal');
        const ins = await tx
          .query(`INSERT INTO users (username, display_name, password_hash, role_id) VALUES ($1, $2, $3, $4) RETURNING id`, [
            b.username,
            b.display_name,
            hash,
            role['id'],
          ])
          .catch((err: unknown) => {
            throw isUniqueViolation(err) ? conflict('Username sudah dipakai') : err;
          });
        if (!ins.rows[0]) throw conflict('Username sudah dipakai');
        const id = Number(ins.rows[0]['id']);
        for (const l of new Set(b.locations)) await tx.query(`INSERT INTO user_site_scope (user_id, location) VALUES ($1, $2)`, [id, l]);
        await recordAudit(tx, req, { action: 'user.create', target: b.username, detail: { role: b.role, locations: b.locations } });
        return { id, username: b.username };
      });
      res.status(201).json({ data: user, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  r.patch('/users/:id', manageUsers, async (req, res, next) => {
    try {
      const id = parseInput(z.coerce.number().int().positive(), req.params['id']);
      const b = parseInput(
        z.object({
          display_name: z.string().min(1).max(80).optional(),
          role: z.string().optional(),
          active: z.boolean().optional(),
          password: password.optional(),
          locations: z.array(tempat).max(3).optional(),
          version: z.number().int().positive(),
        }),
        req.body,
      );
      if (req.principal?.kind === 'user' && req.principal.id === id && b.active === false)
        throw badRequest('Tidak bisa menonaktifkan akun sendiri');
      const hash = b.password ? await AuthService.hashPassword(b.password) : null;
      await withTransaction(pool, async (tx) => {
        const roleId = b.role ? (await tx.query(`SELECT id FROM roles WHERE code = $1`, [b.role])).rows[0]?.['id'] : null;
        if (b.role && !roleId) throw badRequest('Role tidak dikenal');
        const upd = await tx.query(
          `UPDATE users SET display_name = COALESCE($2, display_name), role_id = COALESCE($3, role_id), active = COALESCE($4, active),
             password_hash = COALESCE($5, password_hash), failed_attempts = CASE WHEN $5::text IS NULL THEN failed_attempts ELSE 0 END,
             locked_until = CASE WHEN $5::text IS NULL THEN locked_until ELSE NULL END, version = version + 1, updated_at = now()
           WHERE id = $1 AND version = $6 RETURNING id`,
          [id, b.display_name ?? null, roleId ?? null, b.active ?? null, hash, b.version],
        );
        if (!upd.rows[0]) throw conflict();
        if (b.locations) {
          await tx.query(`DELETE FROM user_site_scope WHERE user_id = $1`, [id]);
          for (const l of new Set(b.locations)) await tx.query(`INSERT INTO user_site_scope (user_id, location) VALUES ($1, $2)`, [id, l]);
        }
        // Sesi lama dicabut saat password/role/status berubah.
        if (hash || b.role || b.active === false) await tx.query(`DELETE FROM sessions WHERE user_id = $1`, [id]);
        await recordAudit(tx, req, {
          action: 'user.update',
          target: String(id),
          detail: { role: b.role, active: b.active, passwordChanged: Boolean(hash), locations: b.locations },
        });
      });
      res.json({ data: { id }, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  // ---- Devices (iPad kiosk) ----
  r.get('/devices', manageDevices, async (_req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT id, name, location, created_at, last_seen_at, revoked_at FROM devices ORDER BY id DESC`);
      res.json({ data: rows, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  r.post('/devices/pairing-codes', manageDevices, async (req, res, next) => {
    try {
      const b = parseInput(z.object({ location: tempat.optional() }), req.body ?? {});
      const code = newPairingCode();
      const expiresAt = new Date(Date.now() + opts.pairingTtlMin * 60_000);
      await withTransaction(pool, async (tx) => {
        await tx.query(`INSERT INTO device_pairing_codes (code_hash, location, created_by, expires_at) VALUES ($1, $2, $3, $4)`, [
          hashToken(code),
          b.location ?? null,
          principalOf(req).id,
          expiresAt,
        ]);
        await recordAudit(tx, req, { action: 'device.pairing_code.create', detail: { location: b.location ?? null, expiresAt } });
      });
      res.status(201).json({ data: { code, expiresAt }, status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  r.post('/devices/:id/revoke', manageDevices, async (req, res, next) => {
    try {
      const id = parseInput(z.coerce.number().int().positive(), req.params['id']);
      await withTransaction(pool, async (tx) => {
        const upd = await tx.query(`UPDATE devices SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING id`, [id]);
        if (!upd.rows[0]) throw notFound('Perangkat tidak ada atau sudah dicabut');
        await recordAudit(tx, req, { action: 'device.revoke', target: String(id) });
      });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  r.get('/audit', requirePermission('audit.view'), async (req, res, next) => {
    try {
      const q = parseInput(
        z.object({ limit: z.coerce.number().int().min(1).max(500).default(100), before: z.coerce.number().int().positive().optional() }),
        req.query,
      );
      res.json({ data: await listAudit(pool, q.limit, q.before), status: 'ok' });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
