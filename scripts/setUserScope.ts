// Run only by an authorized dashboard DB operator, while the app is stopped.
import pg from 'pg';

async function main(): Promise<void> {
  const url = process.env['DASHBOARD_DATABASE_URL'];
  const [emailArg, scopeArg, ...extra] = process.argv.slice(2);
  const email = emailArg?.trim().toLowerCase();
  const scopes: Record<string, string[]> = {
    hirose: ['internal', 'sgp', 'systech'],
    internal: ['internal'],
    sgp: ['sgp'],
    systech: ['systech'],
  };
  const locations = scopeArg && Object.hasOwn(scopes, scopeArg) ? scopes[scopeArg] : undefined;
  if (!url || !email || !locations || extra.length)
    throw new Error('Usage: setUserScope.ts <email> <hirose|internal|sgp|systech> (DASHBOARD_DATABASE_URL required)');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT id FROM users WHERE email = $1 FOR UPDATE', [email]);
    if (result.rows.length !== 1) throw new Error('Akun tidak ditemukan atau ambigu. Tidak ada perubahan.');
    const id = Number(result.rows[0]['id']);
    await client.query('DELETE FROM user_site_scope WHERE user_id = $1', [id]);
    for (const site of locations)
      await client.query('INSERT INTO user_site_scope (user_id, location) VALUES ($1, $2)', [id, site]);
    await client.query('UPDATE users SET version = version + 1 WHERE id = $1', [id]);
    await client.query('DELETE FROM sessions WHERE user_id = $1', [id]);
    await client.query('DELETE FROM device_pairing_codes WHERE created_by = $1 AND consumed_at IS NULL', [id]);
    await client.query(`INSERT INTO audit_log (actor_type, action, target) VALUES ('system', 'user.scope.set', $1)`, [
      `${email}: ${locations.join(',')}`,
    ]);
    await client.query('COMMIT');
    console.log(`Scope ${email}: ${locations.join(', ')}. Sesi lama dicabut.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
