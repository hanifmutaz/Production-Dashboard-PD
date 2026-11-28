// Buat akun Admin pertama di DB dashboard. Password dibaca dari env (tidak di-hardcode, tidak di argumen CLI).
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import pg from 'pg';
import { AuthService } from '../apps/api/src/modules/auth/authService.js';

async function main(): Promise<void> {
  const url = process.env['DASHBOARD_DATABASE_URL'];
  const email = z.string().trim().toLowerCase().max(254).email().parse(process.env['ADMIN_EMAIL']);
  const password = process.env['ADMIN_PASSWORD'];
  if (!url || !password) throw new Error('Set DASHBOARD_DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD');
  if (password.length < 10) throw new Error('ADMIN_PASSWORD minimal 10 karakter');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const hash = await AuthService.hashPassword(password);
    await client.query('BEGIN');
    const { rowCount, rows } = await client.query(
      `INSERT INTO users (email, display_name, password_hash, role_id, username)
       SELECT $1, $1, $2, id, $3 FROM roles WHERE code = 'admin' ON CONFLICT (email) DO NOTHING RETURNING id`,
      [email, hash, randomUUID()],
    );
    if (rows[0]) {
      for (const site of ['internal', 'sgp', 'systech'])
        await client.query('INSERT INTO user_site_scope (user_id, location) VALUES ($1, $2)', [rows[0]['id'], site]);
      await client.query(`INSERT INTO audit_log (actor_type, action, target) VALUES ('system', 'user.create_admin', $1)`, [email]);
    }
    await client.query('COMMIT');
    console.log(rowCount ? `Admin ${email} dibuat.` : `User ${email} sudah ada — tidak diubah.`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
