// Sender V3 berdampingan dengan layanan lama. Satu snapshot konsisten per tanggal produksi.
import { z } from 'zod';
import { createConmasPool, createConmasReader } from '../apps/api/src/db/conmas.js';
import { loadReportColumns } from '../apps/api/src/columns/reportColumns.js';
import { ColumnSql, loadAvailableColumns } from '../apps/api/src/modules/reporting/columns.js';
import { readProductionDay } from '../apps/api/src/modules/sync/readDay.js';
import { readFile, writeFile, rename } from 'node:fs/promises';
const cfg = z
  .object({
    SOURCE_NAME: z.enum(['sgp', 'systech']),
    CONMAS_DATABASE_URL: z.string().min(1),
    PUSH_MASTER_URL: z.url(),
    PUSH_SYNC_KEY: z.string().min(1),
    PUSH_INTERVAL_MS: z.coerce.number().int().min(10000).default(60000),
  })
  .parse(process.env);
const url = new URL(cfg.PUSH_MASTER_URL);
if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
  throw Error('Gunakan HTTPS tunnel atau HTTP localhost untuk trial');
const view = cfg.SOURCE_NAME === 'sgp' ? 'view_report_1127' : 'view_report_1677';
const pool = createConmasPool(cfg.CONMAS_DATABASE_URL);
const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const add = (date: string, n: number) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
async function main() {
  const rc = { ...loadReportColumns('config/reportColumns.subcont.cjs'), VIEW: view };
  const cols = new ColumnSql(rc, await loadAvailableColumns(createConmasReader(pool), view), '2026-11-27');
  for (const k of ['tanggal', 'line', 'production_mode', 'output_actual', 'output_plan', 'shift'] as const) cols.mustRef(rc.COLS[k]);
  async function send(date: string) {
    const client = await pool.connect();
    const timestamp = new Date().toISOString();
    let data;
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const reader = createConmasReader(client);
      data = await readProductionDay(reader, cols, date);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/json', 'x-sync-key': cfg.PUSH_SYNC_KEY },
      body: JSON.stringify({ source: cfg.SOURCE_NAME, type: 'production-day-' + date, timestamp, data }),
    });
    if (!res.ok || ((await res.json()) as { ok?: boolean }).ok !== true) throw Error('Push ditolak: HTTP ' + res.status);
    console.log(
      date,
      data.details.length,
      'report, actual',
      data.totals.reduce((a, r) => a + r.actual, 0),
    );
  }
  const args = process.argv.slice(2);
  if (args.length) {
    if (args.length !== 2) throw Error('Isi tanggal awal dan akhir YYYY-MM-DD');
    const [from, end] = z.tuple([z.iso.date(), z.iso.date()]).parse(args);
    if (from > end || end > today()) throw Error('Rentang tanggal tidak valid');
    for (let d = from; d <= end; d = add(d, 1)) {
      await send(d);
      await new Promise((r) => setTimeout(r, 2200));
    }
    return;
  }
  const file = '.subcont-' + cfg.SOURCE_NAME + '.cursor';
  let cursor = add(today(), -1);
  try {
    cursor = z.iso.date().parse((await readFile(file, 'utf8')).trim());
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    await writeFile(file, cursor, { flag: 'wx' });
  }
  for (;;) {
    try {
      const day = today();
      await send(day);
      await send(add(day, -1));
      for (let i = 0; i < 5 && cursor < add(day, -1); i++) {
        await send(cursor);
        cursor = add(cursor, 1);
        await writeFile(file + '.tmp', cursor);
        await rename(file + '.tmp', file);
        await new Promise((r) => setTimeout(r, 2200));
      }
    } catch (e) {
      console.error('Gagal sinkron, akan dicoba ulang:', e instanceof Error ? e.message : 'error');
    }
    await new Promise((r) => setTimeout(r, cfg.PUSH_INTERVAL_MS));
  }
}
main()
  .finally(() => pool.end())
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
