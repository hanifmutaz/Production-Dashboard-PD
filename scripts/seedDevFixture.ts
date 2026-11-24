// db:seed:dev — buat tabel + view `view_report_dev` berisi data sintetis di Postgres LOKAL. Ditolak di production.
import path from 'node:path';
import pg from 'pg';
import { loadReportColumns } from '../apps/api/src/columns/reportColumns.js';
import { buildRow, fixtureDdl, insertSql, standardScenario } from '../apps/api/src/devtools/devFixture.js';

async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') throw new Error('Fixture dev dilarang di production');
  const url = process.env['DEV_FIXTURE_DATABASE_URL'];
  if (!url) throw new Error('Set DEV_FIXTURE_DATABASE_URL (Postgres lokal, BUKAN DB ConMas asli)');
  const rc = loadReportColumns(path.resolve('config/reportColumns.example.js'));
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP VIEW IF EXISTS view_report_dev');
    await client.query('DROP TABLE IF EXISTS fixture_report_dev');
    await client.query(fixtureDdl(rc, 'fixture_report_dev'));
    const now = new Date(Date.now() + 7 * 3600 * 1000);
    const specs = standardScenario(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
    for (const spec of specs) {
      const { sql, params } = insertSql('fixture_report_dev', buildRow(rc, spec));
      await client.query(sql, params);
    }
    await client.query('CREATE VIEW view_report_dev AS SELECT * FROM fixture_report_dev');
    await client.query('COMMIT');
    console.log(`view_report_dev dibuat: ${specs.length} report. Set DB_VIEW_NAME=view_report_dev untuk dev.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
