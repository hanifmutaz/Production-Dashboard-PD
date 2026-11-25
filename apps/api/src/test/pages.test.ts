// Endpoint yang dipakai halaman sesi 3: summary/range, line-metrics, planning, lines/all, settings ketat,
// custom role (menus + hapus), device per line, /auth/me (today, menus).
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createHarness } from './harness.js';
import { loginAs } from './agent.js';

const rep = {
  line: 'L01',
  date: '2026-11-24',
  shift: 'Shift 1 (2 Shift)',
  plan: 1000,
  actual: 900,
  rejectM107: 10,
  jamTarget: 480,
  jamEfektif: 450,
  oee: 80,
  products: [{ cl: 'CL-A', name: 'P-A', mo: 'MO1', qty: 900 }],
  stoptime4m: { machine: 20, man: 5, material: 1, method: 3, other: 1 },
};

async function setup() {
  const h = await createHarness();
  await h.createUser('admin1', 'admin');
  h.addReports([
    rep,
    {
      ...rep,
      line: 'L02',
      date: '2026-11-23',
      plan: 500,
      actual: 400,
      rejectM107: 0,
      stoptime4m: { machine: 0, man: 0, material: 0, method: 0, other: 0 },
    },
  ]);
  return { h, admin: await loginAs(h, 'admin1') };
}

describe('reporting untuk halaman', () => {
  it('summary/range: SUM + 4M (menit) + PPM; tanpa data → no_data', async () => {
    const { admin } = await setup();
    const r = await admin.get('/api/v3/reporting/summary/range?start=2026-11-23&end=2026-11-24&location=internal');
    expect(r.body.data).toMatchObject({
      output_plan: 1500,
      output_actual: 1300,
      qty_reject: 10,
      reject_ppm: 7634,
      stoptime_total: 60,
      stoptime_4m: [20, 5, 1, 3, 1],
    });
    const none = await admin.get('/api/v3/reporting/summary/range?start=2026-10-01&end=2026-10-02');
    expect(none.body).toEqual({ data: null, status: 'no_data' });
  });

  it('line-metrics total & per hari; line tanpa report tetap muncul (reports 0)', async () => {
    const { admin } = await setup();
    const tot = await admin.get('/api/v3/reporting/line-metrics?start=2026-11-23&end=2026-11-24&location=internal');
    const l01 = tot.body.data.rows.find((r: { line: string }) => r.line === 'L01');
    expect(l01).toMatchObject({
      date: null,
      reports: 1,
      plan: 1000,
      actual: 900,
      bekidoritsu: 90,
      reject_ppm: 10989,
      stoptime: 30,
      stoptime_4m: [20, 5, 1, 3, 1],
      oee: 80,
    });
    expect(tot.body.data.rows.find((r: { line: string }) => r.line === 'L03')).toMatchObject({ reports: 0, bekidoritsu: null });
    const per = await admin.get('/api/v3/reporting/line-metrics?start=2026-11-23&end=2026-11-24&line=L01&perDay=1');
    expect(per.body.data.rows).toHaveLength(1);
    expect(per.body.data.rows[0].date).toBe('2026-11-24');
  });

  it('reports per line membawa loss & kategori', async () => {
    const { admin } = await setup();
    const r = await admin.get('/api/v3/reporting/reports?start=2026-11-24&end=2026-11-24&line=L01');
    expect(r.body.data).toHaveLength(1);
    expect(r.body.data[0]).toMatchObject({ line: 'L01', shift: 1, categories: [20, 5, 1, 3, 1] });
  });
});

describe('master data & target', () => {
  it('lines/all + PUT atribut baru (produk, kode ConMas, cycle time), versi basi → 409', async () => {
    const { admin } = await setup();
    const all = await admin.get('/api/v3/lines/all');
    const l01 = all.body.data.find((l: { line_code: string }) => l.line_code === 'L01');
    const ok = await admin.put('/api/v3/lines/L01', {
      description: 'Line 1',
      shift_scheme: 2,
      tempat: 'internal',
      product: 'FH12',
      external_code: '41HR01',
      cycle_time: 6.5,
      version: l01.version,
    });
    expect(ok.body.data).toMatchObject({ product: 'FH12', external_code: '41HR01' });
    expect(Number(ok.body.data.cycle_time)).toBe(6.5);
    expect((await admin.put('/api/v3/lines/L01', { shift_scheme: 2, tempat: 'internal', version: l01.version })).status).toBe(409);
  });

  it('planning: target line simpan & update; target lokasi ikut terbaca', async () => {
    const { admin } = await setup();
    await admin.put('/api/v3/executive/target', { year: 2026, month: 11, tempat: 'internal', target: 21000 });
    const a = await admin.put('/api/v3/planning/line', { line_code: 'L01', year: 2026, month: 11, target: 30000, work_days: 21 });
    expect(a.body.data.version).toBe(1);
    expect((await admin.put('/api/v3/planning/line', { line_code: 'L01', year: 2026, month: 11, target: 1, work_days: 21 })).status).toBe(
      409,
    );
    await admin.put('/api/v3/planning/line', {
      line_code: 'L01',
      year: 2026,
      month: 11,
      target: 31000,
      work_days: 20,
      note: 'revisi',
      version: 1,
    });
    const g = await admin.get('/api/v3/planning?year=2026&month=11');
    expect(g.body.data.locations).toHaveLength(1);
    expect(g.body.data.lines[0]).toMatchObject({ line_code: 'L01', work_days: 20, note: 'revisi', version: 2 });
    expect((await admin.put('/api/v3/planning/line', { line_code: 'L01', year: 2026, month: 11, target: -1, work_days: 0 })).status).toBe(
      400,
    );
  });
});

describe('settings ketat', () => {
  it('config.kpi: kuning harus < hijau; config.display enum; daftar baris dibatasi', async () => {
    const { admin } = await setup();
    const kpi = { yellow: 90, green: 100, oee: 85, sogo: 85, shugyo: 85, ppm: 500 };
    expect((await admin.put('/api/v3/settings/config.kpi', { value: kpi })).status).toBe(200);
    expect((await admin.put('/api/v3/settings/config.kpi', { value: { ...kpi, yellow: 100 }, version: 1 })).status).toBe(400);
    expect((await admin.put('/api/v3/settings/config.display', { value: { home: 'x' } })).status).toBe(400);
    expect(
      (await admin.put('/api/v3/settings/config.defects', { value: { rows: [{ id: 'd1', active: true, code: 'Burr', name: 'Burr' }] } }))
        .status,
    ).toBe(200);
    expect(
      (await admin.put('/api/v3/settings/config.defects', { value: { rows: [{ id: '../x', active: true }] }, version: 1 })).status,
    ).toBe(400);
    const eff = await admin.get('/api/v3/settings/effective');
    expect(eff.body.data.shift).toMatchObject({ shift2StartHour: 7, lineNotRunningThresholdMin: 120 });
  });
});

describe('akses: custom role & perangkat', () => {
  it('/auth/me memuat today (jam server) & menus custom role; hapus role yang masih dipakai → 409', async () => {
    const { h, admin } = await setup();
    const me = await admin.get('/api/v3/auth/me');
    expect(me.body.data).toMatchObject({ today: '2026-11-24', menus: [] });
    await admin.put('/api/v3/access/roles/meeting', {
      name: 'Meeting',
      permissions: ['dashboard.view'],
      menus: ['monitoring-output', 'lines'],
    });
    await admin.post('/api/v3/access/users', { email: 'meet1@example.test', display_name: 'Meet', password: 'password-panjang-1', role: 'meeting' });
    const meet = await loginAs(h, 'meet1', 'password-panjang-1');
    expect((await meet.get('/api/v3/auth/me')).body.data.menus).toEqual(['lines', 'monitoring-output']);
    expect((await admin.delete('/api/v3/access/roles/meeting')).status).toBe(409);
    expect((await admin.delete('/api/v3/access/roles/admin')).status).toBe(403);
    await admin.put('/api/v3/access/roles/temp', { name: 'Temp', permissions: ['dashboard.view'], menus: ['hub'] });
    expect((await admin.delete('/api/v3/access/roles/temp')).status).toBe(204);
  });

  it('pairing terikat line + nama; kiosk /auth/me berisi line; daftar perangkat & kode menunggu', async () => {
    const { h, admin } = await setup();
    const code = (await admin.post('/api/v3/access/devices/pairing-codes', { location: 'internal', line_code: 'L01', name: 'iPad L01' }))
      .body.data.code as string;
    const list = await admin.get('/api/v3/access/devices');
    expect(list.body.data.pending[0]).toMatchObject({ line_code: 'L01', device_name: 'iPad L01' });
    const paired = await request(h.app)
      .post('/api/v3/auth/pair')
      .send({ code: `${code.slice(0, 4)}-${code.slice(4)}`, name: 'Safari' });
    expect(paired.status).toBe(201);
    expect(paired.body.data.device).toMatchObject({ name: 'iPad L01', line_code: 'L01' });
    const me = await request(h.app).get('/api/v3/auth/me').set('authorization', `Device ${paired.body.data.token}`);
    expect(me.body.data).toMatchObject({ kind: 'device', line: 'L01', menus: ['line'] });
  });
});

describe('daftar & ubah akun', () => {
  it('GET /access/users (cakupan lokasi) & PATCH ganti role/lokasi; versi basi → 409', async () => {
    const { h, admin } = await setup();
    const id = await h.createUser('op1', 'viewer', 'password-rahasia-1', ['internal']);
    const list = await admin.get('/api/v3/access/users');
    const op = list.body.data.find((u: { username: string }) => u.username === 'op1');
    expect(op).toMatchObject({ role: 'viewer', locations: ['internal'], version: 1 });
    expect((await admin.patch(`/api/v3/access/users/${id}`, { role: 'supervisor', locations: [], version: 1 })).status).toBe(200);
    expect((await admin.patch(`/api/v3/access/users/${id}`, { role: 'admin', version: 1 })).status).toBe(409);
    const after = (await admin.get('/api/v3/access/users')).body.data.find((u: { username: string }) => u.username === 'op1');
    expect(after).toMatchObject({ role: 'supervisor', locations: [], version: 2 });
  });
});
