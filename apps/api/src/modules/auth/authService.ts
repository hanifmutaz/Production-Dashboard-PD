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
  return new Set(values.map(String).filter((v): v is Permission => allowed.has(v)));
}

export async function loadUserPrincipal(db: Queryable, userId: number): Promise<Principal | null> {
  const { rows } = await db.query(
    `SELECT u.id, u.display_name, r.id AS role_id, r.code AS role_code FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1 AND u.active = true`,
    [userId],
  );
  const u = rows[0];
  if (!u) return null;
  const perms = await db.query(`SELECT permission FROM role_permissions WHERE role_id = $1`, [u['role_id']]);
  const scope = await db.query(`SELECT location FROM user_site_scope WHERE user_id = $1 ORDER BY location`, [userId]);
  return {
    kind: 'user',
    id: Number(u['id']),
    name: String(u['display_name']),
    roleCode: String(u['role_code']),
    permissions: toPermissions(perms.rows.map((p) => p['permission'])),
    locations: scope.rows.map((s) => String(s['location'])),
  };
}

export class AuthService {
  constructor(
    private readonly pool: DbPool,
    private readonly cfg: AuthConfig,
  ) {}

  async login(
    username: string,
    password: string,
    req: { requestId: string },
  ): Promise<{ token: string; expiresAt: Date; principal: Principal }> {
    const { rows } = await this.pool.query(
      `SELECT id, password_hash, failed_attempts, locked_until, active FROM users WHERE username = $1`,
      [username],
    );
    const user = rows[0];
    if (!user || user['active'] !== true) {
      await argon2.verify(await getDummyHash(), password).catch(() => false);
      await recordAudit(this.pool, { requestId: req.requestId }, { action: 'auth.login_failed', target: username });
      throw unauthorized('Username atau password salah');
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
        await recordAudit(tx, { requestId: req.requestId }, { action: 'auth.login_failed', target: username });
      });
      throw unauthorized('Username atau password salah');
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
          principal: { kind: 'user', id: userId, name: username, roleCode: '', permissions: new Set(), locations: [] },
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
      `UPDATE devices SET last_seen_at = now() WHERE token_hash = $1 AND revoked_at IS NULL RETURNING id, name, location`,
      [hashToken(token)],
    );
    const d = rows[0];
    if (!d) return null;
    return {
      kind: 'device',
      id: Number(d['id']),
      name: String(d['name']),
      roleCode: 'kiosk',
      permissions: DEVICE_PERMISSIONS,
      locations: d['location'] ? [String(d['location'])] : [],
    };
  }

  static hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }
}
