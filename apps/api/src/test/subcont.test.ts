import { test, expect } from 'vitest';
import request from 'supertest';
import { createHarness } from './harness.js';
import { loginAs } from './agent.js';
import { createConmasReader } from '../db/conmas.js';
import { ColumnSql } from '../modules/reporting/columns.js';
import { fixtureColumns } from '../devtools/devFixture.js';
import { readProductionDay } from '../modules/sync/readDay.js';

test('transisi per tanggal produksi, pengiriman ulang dan koreksi tetap terpisah per lokasi', async () => {
  const date = '2026-11-26',
    next = '2026-11-27',
    shift = 'Shift 1 (2 Shift)';
  const h = await createHarness({ now: Date.parse(next + 'T05:00:00Z'), subcontEnabled: true });
  const cols = new ColumnSql(h.rc, new Set(fixtureColumns(h.rc).map((c) => c.name)), next);
  const { Pool } = h.conmasDb.adapters.createPg();
  const reader = createConmasReader(new Pool());
  h.addReports([
    { line: '41GP24D', date, shift, plan: 0, actual: 215, productionMode: null },
    { line: '41GP24Re-insp', date, shift, actual: 99, productionMode: null },
    { line: '41SY31', date: next, shift, plan: 120, actual: 106 },
    { line: '41SY31', date: next, shift, actual: 700, productionMode: null },
    { line: '41SY31', date: next, shift, actual: 800, productionMode: 'false' },
  ]);
  const gp = await readProductionDay(reader, cols, date),
    sy = await readProductionDay(reader, cols, next);
  expect(gp.totals).toMatchObject([{ line: '41GP24', actual: 215, plan: 0 }]);
  expect(sy.totals).toMatchObject([{ line: '41SY31', actual: 106, plan: 120 }]);
  const push = (source: string, data: typeof gp, timestamp: string, key = source + '-key-123456') =>
    request(h.app)
      .post('/api/sync')
      .set('x-sync-key', key)
      .send({ source, type: 'production-day-' + data.date, timestamp, data });
  const t = next + 'T04:59:00.123Z';
  expect((await push('systech', sy, t, 'sgp-key-123456')).status).toBe(401);
  expect((await push('sgp', gp, t)).body).toMatchObject({ ok: true, accepted: true });
  expect((await push('systech', sy, t)).body).toMatchObject({ ok: true, accepted: true });
  await push('sgp', gp, t);
  const revised = {
    ...gp,
    totals: gp.totals.map((r) => ({ ...r, actual: 217 })),
    details: gp.details.map((r) => ({ ...r, num: { ...r.num, output_actual: 217 } })),
  };
  expect((await push('sgp', revised, next + 'T05:00:01.456Z')).body.accepted).toBe(true);
  expect((await push('sgp', gp, t)).body.accepted).toBe(false);
  await h.dashboard.query('UPDATE push_snapshots SET received_at=$1', [next + 'T04:59:55Z']);
  await h.createUser('pilot', 'admin');
  const user = await loginAs(h, 'pilot');
  const daily = (site: string, day: string) => user.get('/api/v3/reporting/summary/daily?date=' + day + '&location=' + site);
  expect((await daily('sgp', date)).body).toMatchObject({ status: 'ok', data: { output_actual: 217 } });
  expect((await daily('systech', next)).body).toMatchObject({ status: 'ok', data: { output_actual: 106 } });
  expect((await daily('systech', date)).body).toMatchObject({ data: null, status: 'unavailable' });
  expect((await user.get('/api/v3/reporting/summary/monthly?year=2026&month=11&location=sgp')).body).toMatchObject({
    data: null,
    status: 'unavailable',
  });
});
