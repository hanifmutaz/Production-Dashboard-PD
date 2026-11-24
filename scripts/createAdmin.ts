// Buat akun Admin pertama di DB dashboard. Password dibaca dari env (tidak di-hardcode, tidak di argumen CLI).
import pg from 'pg';
import { AuthService } from '../apps/api/src/modules/auth/authService.js';

async function main(): Promise<void> {
  const url = process.env['DASHBOARD_DATABASE_URL'];
  const username = process.env['ADMIN_USERNAME'];
  const password = process.env['ADMIN_PASSWORD'];
  if (!url || !username || !password) throw new Error('Set DASHBOARD_DATABASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD');
  if (password.length < 10) throw new Error('ADMIN_PASSWORD minimal 10 karakter');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const hash = await AuthService.hashPassword(password);
    const { rowCount } = await client.query(
      `INSERT INTO users (username, display_name, password_hash, role_id)
       SELECT $1, $1, $2, id FROM roles WHERE code = 'admin' ON CONFLICT (username) DO NOTHING`,
      [username, hash],
    );
    await client.query(`INSERT INTO audit_log (actor_type, action, target) VALUES ('system', 'user.create_admin', $1)`, [username]);
    console.log(rowCount ? `Admin ${username} dibuat.` : `User ${username} sudah ada — tidak diubah.`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
