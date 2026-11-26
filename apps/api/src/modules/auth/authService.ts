import argon2 from 'argon2';
import type { DbPool, Queryable } from '../../db/pool.js';
import { withTransaction } from '../../db/pool.js';
import { AppError, unauthorized } from '../../http/errors.js';
import type { Permission, Principal } from '../../http/types.js';
import { ALL_PERMISSIONS } from '../../http/types.js';
import { recordAudit } from '../audit/auditService.js';
import { hashToken, newToken } from './tokens.js';

export interface AuthConfig {
  readonly sessionTtlHours: number;
  readonly maxAttempts: number;
  readonly lockMinutes: number;
}

/** Kiosk iPad: hanya lihat & Mode Meeting (read-only). */
export const DEVICE_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>(['dashboard.view', 'meeting.use']);

// Hash dummy agar waktu respons user-tidak-ada ≈ password-salah (mengurangi enumerasi user).
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= argon2.hash('dummy-password-for-timing');
  return dummyHash;
}

function toPermissions(values: readonly unknown[]): Set<Permission> {
  const allowed = new Set<string>(ALL_PERMISSIONS);
  const permissions = new Set(values.map(String).filter((v): v is Permission => allowed.has(v)));
  if (permissions.has('config.edit')) permissions.add('config.view');
  return permissions;
}

export async function loadUserPrincipal(db: Queryable, userId: number): Promise<Principal | null> {
  const { rows } = await db.query(
    `SELECT u.id, u.display_name, r.id AS role_id, r.code AS role_code FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1 AND u.active = true AND u.status = 'approved'`,
    [userId],
  );
  const u = rows[0];
  if (!u) return null;
  const perms = await db.query(`SELECT permission FROM role_permissions WHERE role_id = $1`, [u['role_id']]);
  const scope = await db.query(`SELECT location FROM user_site_scope WHERE user_id = $1 ORDER BY location`, [userId]);
  const menus = await db.query(`SELECT menu FROM role_menus WHERE role_id = $1 ORDER BY menu`, [u['role_id']]);
  return {
    kind: 'user',
    id: Number(u['id']),
    name: String(u['display_name']),
    roleCode: String(u['role_code']),
    permissions: toPermissions(perms.rows.map((p) => p['permission'])),
    locations: scope.rows.map((s) => String(s['location'])),
    menus: menus.rows.map((m) => String(m['menu'])),
  };
}

export class AuthService {
  constructor(
    private readonly pool: DbPool,
    private readonly cfg: AuthConfig,
  ) {}

  async login(
    email: string,
    password: string,
    req: { requestId: string },
  ): Promise<{ token: string; expiresAt: Date; principal: Principal }> {
    const { rows } = await this.pool.query(
      `SELECT id, password_hash, failed_attempts, locked_until, active, status FROM users WHERE email = $1`,
      [email],
    );
    const user = rows[0];
    if (!user) {
      await argon2.verify(await getDummyHash(), password).catch(() => false);
      await recordAudit(this.pool, { requestId: req.requestId }, { action: 'auth.login_failed', target: email });
      throw unauthorized('Email atau password salah');
    }
    if (user['active'] !== true || user['status'] !== 'approved') {
      // Status pendaftaran hanya dibuka bila password benar, supaya email orang lain tidak bisa dicek statusnya.
      const ok = await argon2.verify(String(user['password_hash']), password).catch(() => false);
      await recordAudit(this.pool, { requestId: req.requestId }, { action: 'auth.login_failed', target: email });
      if (ok && user['status'] === 'pending')
        throw new AppError(403, 'ACCOUNT_PENDING', 'Pendaftaran Anda masih menunggu persetujuan admin.');
      if (ok && user['status'] === 'rejected')
        throw new AppError(403, 'ACCOUNT_REJECTED', 'Pendaftaran Anda ditolak. Hubungi admin untuk informasi lebih lanjut.');
      throw unauthorized('Email atau password salah');
    }
    const userId = Number(user['id']);
    const lockedUntil = user['locked_until'] ? new Date(String(user['locked_until'])) : null;
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      throw new AppError(429, 'ACCOUNT_LOCKED', 'Akun dikunci sementara karena terlalu banyak percobaan. Coba lagi nanti.');
    }
    const ok = await argon2.verify(String(user['password_hash']), password).catch(() => false);
    if (!ok) {
      await withTransaction(this.pool, async (tx) => {
        // Penambahan atomik agar percobaan paralel tetap terhitung.
        await tx.query(
          `UPDATE users SET failed_attempts = failed_attempts + 1,
             locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN now() + ($3 || ' minutes')::interval ELSE locked_until END
           WHERE id = $1`,
          [userId, this.cfg.maxAttempts, String(this.cfg.lockMinutes)],
        );
        await recordAudit(tx, { requestId: req.requestId }, { action: 'auth.login_failed', target: email });
      });
      throw unauthorized('Email atau password salah');
    }
    const token = newToken();
    const expiresAt = new Date(Date.now() + this.cfg.sessionTtlHours * 3600 * 1000);
    await withTransaction(this.pool, async (tx) => {
      await tx.query(`UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1`, [userId]);
      await tx.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [hashToken(token), userId, expiresAt]);
      await recordAudit(
        tx,
        {
          requestId: req.requestId,
          principal: { kind: 'user', id: userId, name: email, roleCode: '', permissions: new Set(), locations: [] },
        },
        { action: 'auth.login' },
      );
    });
    const principal = await loadUserPrincipal(this.pool, userId);
    if (!principal) throw unauthorized();
    return { token, expiresAt, principal };
  }

  async logout(token: string): Promise<void> {
    await this.pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(token)]);
  }

  async resolveSession(token: string): Promise<Principal | null> {
    const { rows } = await this.pool.query(`SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > now()`, [hashToken(token)]);
    const s = rows[0];
    return s ? loadUserPrincipal(this.pool, Number(s['user_id'])) : null;
  }

  async resolveDevice(token: string): Promise<Principal | null> {
    const { rows } = await this.pool.query(
      `UPDATE devices SET last_seen_at = now() WHERE token_hash = $1 AND revoked_at IS NULL RETURNING id, name, location, line_code, screen`,
      [hashToken(token)],
    );
    const d = rows[0];
    if (!d) return null;
    const screen = d['screen'];
    if (screen !== 'line' && screen !== 'hub' && screen !== 'executive') return null;
    return {
      kind: 'device',
      id: Number(d['id']),
      name: String(d['name']),
      roleCode: 'kiosk',
      permissions: DEVICE_PERMISSIONS,
      locations: d['location'] ? [String(d['location'])] : [],
      screen,
      menus: [screen],
      line: d['line_code'] ? String(d['line_code']) : null,
    };
  }

  static hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }
}
