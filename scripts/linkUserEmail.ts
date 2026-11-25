// Mengaitkan alamat yang telah diperiksa admin ke akun lama di DB dashboard.
import pg from 'pg';
import { z } from 'zod';

async function main() {
  const url = z.string().min(1).parse(process.env['DASHBOARD_DATABASE_URL']);
  const username = z.string().min(1).parse(process.env['LEGACY_USERNAME']);
  const email = z.string().trim().toLowerCase().max(254).email().parse(process.env['LOGIN_EMAIL']);
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    await db.query('BEGIN');
    const account = (await db.query('SELECT id, email FROM users WHERE username = $1 FOR UPDATE', [username])).rows[0];
    if (!account) throw Error('Akun lama tidak ditemukan.');
    if (account.email && account.email !== email) throw Error('Akun sudah memiliki email lain.');
    if (!account.email) {
      await db.query('UPDATE users SET email = $1, version = version + 1, updated_at = now() WHERE id = $2', [email, account.id]);
      await db.query('DELETE FROM sessions WHERE user_id = $1', [account.id]);
      await db.query("INSERT INTO audit_log(actor_type, action, target) VALUES ('system', 'user.link_email', $1)", [String(account.id)]);
    }
    await db.query('COMMIT');
    console.log('Email login sudah terhubung:', email);
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    await db.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
