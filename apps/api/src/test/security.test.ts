import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './harness.js';
import { loginAs } from './agent.js';

type Agent = Awaited<ReturnType<typeof loginAs>>;

describe('otorisasi per role (INV-004)', () => {
  let h: Harness;
  let viewer: Agent;
  let supervisor: Agent;
  let admin: Agent;

  beforeEach(async () => {
    h = await createHarness();
    await h.createUser('viewer1', 'viewer');
    await h.createUser('super1', 'supervisor');
    await h.createUser('admin1', 'admin');
    viewer = await loginAs(h, 'viewer1');
    supervisor = await loginAs(h, 'super1');
    admin = await loginAs(h, 'admin1');
  });

  const writeCalls: [string, string, unknown][] = [
    ['put', '/api/v3/executive/target', { year: 2026, month: 11, tempat: 'internal', target: 1000 }],
    ['put', '/api/v3/executive/calendar', { year: 2026, month: 11, tempat: 'internal', holidays: [] }],
    ['put', '/api/v3/lines/L09', { shift_scheme: 2, tempat: 'internal' }],
    ['put', '/api/v3/settings/kpi', { value: { oee: 85 } }],
    ['post', '/api/v3/access/users', { email: 'baru1@example.test', display_name: 'Baru', password: 'password-panjang-1', role: 'viewer' }],
    ['post', '/api/v3/access/devices/pairing-codes', {}],
  ];

  it.each(writeCalls)('%s %s: tanpa login 401, viewer & supervisor 403, admin sukses', async (method, url, body) => {
    const anon = await (method === 'put' ? request(h.app).put(url) : request(h.app).post(url)).send(body as object);
    expect(anon.status).toBe(401);
    expect(
      (await (viewer as unknown as Record<string, (u: string, b: unknown) => Promise<{ status: number }>>)[method]!(url, body)).status,
    ).toBe(403);
    expect(
      (await (supervisor as unknown as Record<string, (u: string, b: unknown) => Promise<{ status: number }>>)[method]!(url, body)).status,
    ).toBe(403);
    const ok = await (admin as unknown as Record<string, (u: string, b: unknown) => Promise<{ status: number }>>)[method]!(url, body);
    expect([200, 201]).toContain(ok.status);
  });

  it('ekspor: viewer 403, supervisor boleh', async () => {
    const body = {
      ds: 'line_day',
      format: 'csv-excel',
      start: '2026-11-01',
      end: '2026-11-03',
      locations: ['internal'],
      columns: ['tgl', 'line', 'ac'],
    };
    expect((await viewer.post('/api/v3/export', body)).status).toBe(403);
    const res = await supervisor.post('/api/v3/export', body);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  it('CSRF: request tulis berbasis cookie tanpa header kustom ditolak', async () => {
    const res = await admin.raw.put('/api/v3/settings/kpi').send({ value: { oee: 85 } });
    expect(res.status).toBe(403);
  });

  it('Custom Role: izin ekspor tanpa config.edit', async () => {
    const saved = await admin.put('/api/v3/access/roles/exporter', {
      name: 'Exporter',
      permissions: ['dashboard.view', 'export.run'],
      menus: ['monitoring'],
    });
    expect(saved.status).toBe(200);
    await admin.post('/api/v3/access/users', {
      email: 'exp1@example.test',
      display_name: 'Exp',
      password: 'password-panjang-1',
      role: 'exporter',
    });
    const exp = await loginAs(h, 'exp1', 'password-panjang-1');
    expect(
      (
        await exp.post('/api/v3/export', {
          ds: 'rej',
          format: 'json',
          start: '2026-11-01',
          end: '2026-11-02',
          locations: ['internal'],
          columns: ['tgl', 'defect', 'qty'],
        })
      ).status,
    ).toBe(200);
    expect((await exp.put('/api/v3/settings/kpi', { value: {} })).status).toBe(403);
  });

  it('izin Settings role bawaan berlaku pada sesi aktif untuk lihat, edit, dan cabut', async () => {
    const url = '/api/v3/settings';
    const change = (version: number, permissions: string[]) =>
      admin.put('/api/v3/access/roles/viewer', {
        name: 'Viewer',
        version,
        permissions: ['dashboard.view', ...permissions],
        menus: ['hub', 'settings'],
      });
    expect((await viewer.get(url)).status).toBe(403);
    h.dashboardDb.public.none(`INSERT INTO settings (key, value) VALUES ('config.display', '{}'), ('config.source', '{}')`);
    const runtime = await viewer.get(url + '/runtime');
    expect(runtime.status).toBe(200);
    expect(runtime.body.data.map((row: { key: string }) => row.key)).toContain('config.display');
    expect(runtime.body.data.map((row: { key: string }) => row.key)).not.toContain('config.source');
    expect((await viewer.put('/api/v3/access/roles/viewer', {})).status).toBe(403);
    expect((await change(1, ['config.view'])).status).toBe(200);
    expect((await viewer.get(url)).status).toBe(200);
    expect((await viewer.get('/api/v3/lines/all')).status).toBe(200);
    expect((await viewer.put(url + '/kpi', { value: {} })).status).toBe(403);
    expect((await viewer.get('/api/v3/access/users')).status).toBe(403);
    expect((await change(1, ['config.edit'])).status).toBe(409);
    expect((await change(2, ['config.edit'])).status).toBe(200);
    expect((await viewer.put(url + '/kpi', { value: { oee: 80 } })).status).toBe(200);
    expect((await change(3, [])).status).toBe(200);
    expect((await viewer.get(url + '/effective')).status).toBe(403);
    expect((await viewer.put(url + '/kpi', { value: {} })).status).toBe(403);
    expect((await admin.delete('/api/v3/access/roles/viewer')).status).toBe(403);
  });

  it('Admin tetap bisa mengelola role', async () => {
    const save = (permissions: string[], menus: string[]) =>
      admin.put('/api/v3/access/roles/admin', { name: 'Admin Produksi', version: 1, permissions, menus });
    expect((await save([], [])).status).toBe(403);
    expect((await save(['users.manage'], ['hub'])).status).toBe(403);
    expect((await save(['users.manage'], ['settings'])).status).toBe(200);
    expect((await admin.get('/api/v3/access/roles')).status).toBe(200);
  });

  it('cakupan lokasi: user hanya internal ditolak melihat sgp', async () => {
    await h.createUser('scoped1', 'viewer', 'password-rahasia-1', ['internal']);
    const scoped = await loginAs(h, 'scoped1');
    expect((await scoped.get('/api/v3/reporting/summary/current?location=sgp')).status).toBe(403);
    expect((await scoped.get('/api/v3/reporting/summary/current?location=internal')).status).toBe(200);
  });
});

describe('login', () => {
  it('password salah → 401 pesan seragam; dikunci setelah batas percobaan', async () => {
    const h = await createHarness();
    await h.createUser('user1', 'viewer');
    const unknown = await request(h.app).post('/api/v3/auth/login').send({ email: 'tidakada@example.test', password: 'x' });
    const wrong = await request(h.app).post('/api/v3/auth/login').send({ email: 'user1@example.test', password: 'salah' });
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    await request(h.app).post('/api/v3/auth/login').send({ email: 'user1@example.test', password: 'salah' });
    await request(h.app).post('/api/v3/auth/login').send({ email: 'user1@example.test', password: 'salah' });
    const locked = await request(h.app).post('/api/v3/auth/login').send({ email: 'user1@example.test', password: 'password-rahasia-1' });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    const audit = h.dashboardDb.public.many(`SELECT action FROM audit_log WHERE action = 'auth.login_failed'`);
    expect(audit.length).toBe(4);
  });

  it('cookie sesi httpOnly + SameSite=Strict; logout mencabut sesi', async () => {
    const h = await createHarness();
    await h.createUser('user2', 'viewer');
    const agent = request.agent(h.app);
    const res = await agent.post('/api/v3/auth/login').send({ email: 'user2@example.test', password: 'password-rahasia-1' });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect((await agent.post('/api/v3/auth/logout').set('x-v3-csrf', '1')).status).toBe(204);
    expect((await agent.get('/api/v3/auth/me')).status).toBe(401);
  });
});

describe('device pairing (INV-005) & kiosk read-only', () => {
  it('kode sekali pakai: pakai ulang ditolak; kedaluwarsa ditolak; kiosk tidak bisa menulis; cabut → 401', async () => {
    const h = await createHarness();
    await h.createUser('admin1', 'admin');
    const admin = await loginAs(h, 'admin1');
    const code = (await admin.post('/api/v3/access/devices/pairing-codes', { location: 'internal' })).body.data.code as string;
    const first = await request(h.app).post('/api/v3/auth/pair').send({ code, name: 'iPad Line 1' });
    expect(first.status).toBe(201);
    const second = await request(h.app).post('/api/v3/auth/pair').send({ code, name: 'iPad palsu' });
    expect(second.status).toBe(422);
    expect(h.dashboardDb.public.many(`SELECT id FROM devices`).length).toBe(1);

    const token = first.body.data.token as string;
    const kiosk = (url: string) => request(h.app).get(url).set('authorization', `Device ${token}`);
    expect((await kiosk('/api/v3/reporting/summary/current')).status).toBe(200);
    expect((await request(h.app).put('/api/v3/settings/kpi').set('authorization', `Device ${token}`).send({ value: {} })).status).toBe(403);
    expect((await request(h.app).post('/api/v3/export').set('authorization', `Device ${token}`).send({})).status).toBe(403);

    const deviceId = first.body.data.device.id as number;
    expect((await admin.post(`/api/v3/access/devices/${deviceId}/revoke`, {})).status).toBe(204);
    expect((await kiosk('/api/v3/reporting/summary/current')).status).toBe(401);

    const expired = (await admin.post('/api/v3/access/devices/pairing-codes', {})).body.data.code as string;
    h.dashboardDb.public.none(`UPDATE device_pairing_codes SET expires_at = now() - interval '1 minute' WHERE consumed_at IS NULL`);
    expect((await request(h.app).post('/api/v3/auth/pair').send({ code: expired, name: 'telat' })).status).toBe(422);
  });

  it('dua permintaan pairing bersamaan dengan kode sama → hanya satu sukses (cek keadaan DB akhir)', async () => {
    const h = await createHarness();
    await h.createUser('admin1', 'admin');
    const admin = await loginAs(h, 'admin1');
    const code = (await admin.post('/api/v3/access/devices/pairing-codes', {})).body.data.code as string;
    const results = await Promise.all([
      request(h.app).post('/api/v3/auth/pair').send({ code, name: 'A' }),
      request(h.app).post('/api/v3/auth/pair').send({ code, name: 'B' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(h.dashboardDb.public.many(`SELECT id FROM devices`).length).toBe(1);
  });
});

describe('optimistic locking (INV-006) & audit (INV-008)', () => {
  it('target: simpan baru, update dengan version, version basi → 409; tercatat di audit', async () => {
    const h = await createHarness();
    await h.createUser('admin1', 'admin');
    const admin = await loginAs(h, 'admin1');
    const base = { year: 2026, month: 11, tempat: 'internal', target: 21000 };
    const created = await admin.put('/api/v3/executive/target', base);
    expect(created.body.data.version).toBe(1);
    expect((await admin.put('/api/v3/executive/target', { ...base, target: 1 })).status).toBe(409); // insert ulang tanpa version
    expect((await admin.put('/api/v3/executive/target', { ...base, target: 22000, version: 1 })).body.data.version).toBe(2);
    const stale = await admin.put('/api/v3/executive/target', { ...base, target: 99, version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect(Number(h.dashboardDb.public.one(`SELECT target FROM targets`)['target'])).toBe(22000);
    expect(h.dashboardDb.public.many(`SELECT action FROM audit_log WHERE action = 'executive.target.save'`).length).toBe(2);
  });
});

describe('executive', () => {
  it('internal dihitung, SGP/Systech On Hold (bukan 0); total hanya lokasi tersedia', async () => {
    const h = await createHarness();
    await h.createUser('admin1', 'admin');
    const admin = await loginAs(h, 'admin1');
    h.addReports([{ line: 'L01', date: '2026-11-03', shift: 'Shift 1 (2 Shift)', plan: 100, actual: 15000 }]);
    await admin.put('/api/v3/executive/target', { year: 2026, month: 11, tempat: 'internal', target: 21000 });
    await admin.put('/api/v3/executive/target', { year: 2026, month: 11, tempat: 'sgp', target: 5000 });
    const res = await admin.get('/api/v3/executive/month?year=2026&month=11');
    const [internal, sgp] = res.body.data.locations;
    expect(internal.achievement).toMatchObject({ actual: 15000, targetHariIni: 17000, achievementPct: 71.4 });
    expect(sgp).toMatchObject({ status: 'on_hold', achievement: null });
    expect(res.body.data.totalIncludes).toEqual(['internal']);
  });
});

describe('push-sync (INV-007)', () => {
  it('nonaktif saat SUBCONT_ENABLED=false → 503', async () => {
    const h = await createHarness();
    const res = await request(h.app)
      .post('/api/sync')
      .set('x-sync-key', 'sgp-key-123456')
      .send({ source: 'sgp', type: 'summary', timestamp: '2026-11-24T03:00:00Z', data: {} });
    expect(res.status).toBe(503);
  });

  it('aktif: key salah 401; snapshot lebih tua tidak menimpa yang baru', async () => {
    const h = await createHarness({ subcontEnabled: true });
    const send = (key: string, ts: string, v: number) =>
      request(h.app).post('/api/sync').set('x-sync-key', key).send({ source: 'sgp', type: 'summary', timestamp: ts, data: { v } });
    expect((await send('salah', '2026-11-24T03:00:00Z', 1)).status).toBe(401);
    expect((await send('sgp-key-123456', '2026-11-24T03:00:00Z', 1)).body).toEqual({ ok: true, accepted: true });
    const old = await send('sgp-key-123456', '2026-11-24T02:00:00Z', 0);
    expect(old.status).toBe(200);
    expect(old.body.accepted).toBe(false);
    const stored = h.dashboardDb.public.one(`SELECT data FROM push_snapshots WHERE source = 'sgp'`);
    expect(stored['data']).toEqual({ v: 1 });
  });
});

describe('health', () => {
  it('/healthz & /readyz', async () => {
    const h = await createHarness();
    expect((await request(h.app).get('/healthz')).status).toBe(200);
    expect((await request(h.app).get('/readyz')).body).toMatchObject({ dashboard: true, conmas: true });
  });
});
