import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { loginAs } from './agent.js';
import { createHarness, type Harness } from './harness.js';

const PASSWORD = 'password-pendaftar-1';
const form = (over: Record<string, unknown> = {}) => ({
  email: 'Calon@Example.Test ',
  display_name: 'Calon User',
  department: 'Quality Assurance',
  purpose: 'Memantau output line molding tiap shift',
  password: PASSWORD,
  ...over,
});

describe('pendaftaran mandiri + approval admin', () => {
  let h: Harness;
  const register = (body: Record<string, unknown>) => request(h.app).post('/api/v3/auth/register').send(body);
  const login = (email = 'calon@example.test', password = PASSWORD) => request(h.app).post('/api/v3/auth/login').send({ email, password });
  const userRow = (email = 'calon@example.test') =>
    h.dashboardDb.public.one(`SELECT id, status, active, version, role_id FROM users WHERE email = '${email}'`);

  beforeEach(async () => {
    h = await createHarness();
    await h.createUser('admin1', 'admin');
    await h.createUser('viewer1', 'viewer');
  });

  it('register publik → 202, akun pending & nonaktif, belum bisa login', async () => {
    const res = await register(form());
    expect(res.status).toBe(202);
    const u = userRow();
    expect(u['status']).toBe('pending');
    expect(u['active']).toBe(false);
    // password benar → pesan khusus; password salah → generik (tidak membocorkan status)
    const pending = await login();
    expect(pending.status).toBe(403);
    expect(pending.body.error.code).toBe('ACCOUNT_PENDING');
    const wrong = await login('calon@example.test', 'password-salah-1');
    expect(wrong.status).toBe(401);
    const unknown = await login('tidak-ada@example.test');
    expect(unknown.status).toBe(401);
  });

  it('klien tidak bisa menentukan role/status/active sendiri', async () => {
    await register(form({ role: 'admin', status: 'approved', active: true, locations: ['internal'] }));
    const u = userRow();
    expect(u['status']).toBe('pending');
    expect(u['active']).toBe(false);
    const viewer = h.dashboardDb.public.one(`SELECT id FROM roles WHERE code = 'viewer'`);
    expect(u['role_id']).toBe(viewer['id']);
  });

  it('validasi input & email dobel', async () => {
    expect((await register(form({ password: 'pendek' }))).status).toBe(400);
    expect((await register(form({ purpose: 'singkat' }))).status).toBe(400);
    expect((await register(form({ department: '' }))).status).toBe(400);
    expect((await register(form({ email: 'bukan-email' }))).status).toBe(400);
    expect((await register(form())).status).toBe(202);
    const dup = await register(form());
    expect(dup.status).toBe(409);
    // email akun yang sudah ada juga ditolak
    expect((await register(form({ email: 'viewer1@example.test' }))).status).toBe(409);
  });

  it('honeypot terisi → pura-pura sukses tapi tidak menyimpan', async () => {
    const res = await register(form({ website: 'http://spam.example' }));
    expect(res.status).toBe(202);
    expect(h.dashboardDb.public.many(`SELECT id FROM users WHERE email = 'calon@example.test'`)).toHaveLength(0);
  });

  it('antrean & aksi approval hanya untuk yang punya users.manage', async () => {
    await register(form());
    const id = Number(userRow()['id']);
    const viewer = await loginAs(h, 'viewer1');
    expect((await viewer.get('/api/v3/access/registrations')).status).toBe(403);
    expect((await viewer.post(`/api/v3/access/registrations/${id}/approve`, { role: 'admin', version: 1 })).status).toBe(403);
    expect((await request(h.app).get('/api/v3/access/registrations')).status).toBe(401);
    expect(userRow()['status']).toBe('pending');
  });

  it('admin approve → akun aktif dengan role & lokasi pilihan admin', async () => {
    await register(form());
    const admin = await loginAs(h, 'admin1');
    const list = await admin.get('/api/v3/access/registrations');
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ email: 'calon@example.test', department: 'Quality Assurance', status: 'pending' });
    expect((await admin.get('/api/v3/access/registrations/count')).body.data.pending).toBe(1);
    // pending tidak muncul di daftar akun & tidak bisa diaktifkan lewat PATCH (bypass approval)
    const users = await admin.get('/api/v3/access/users');
    expect(users.body.data.some((u: { email: string }) => u.email === 'calon@example.test')).toBe(false);
    const { id, version } = list.body.data[0] as { id: number; version: number };
    expect((await admin.patch(`/api/v3/access/users/${id}`, { active: true, version })).status).toBe(409);
    expect(userRow()['active']).toBe(false);

    expect((await admin.post(`/api/v3/access/registrations/${id}/approve`, { role: 'tidak-ada', locations: ['internal'], version })).status).toBe(400);
    const ok = await admin.post(`/api/v3/access/registrations/${id}/approve`, { role: 'supervisor', locations: ['internal'], version });
    expect(ok.status).toBe(200);
    // approve ulang dengan version lama → ditolak
    expect((await admin.post(`/api/v3/access/registrations/${id}/approve`, { role: 'admin', locations: ['internal'], version })).status).toBe(409);

    const me = await loginAs(h, 'calon', PASSWORD);
    const profile = await me.get('/api/v3/auth/me');
    expect(profile.body.data).toMatchObject({ role: 'supervisor', locations: ['internal'] });
    expect((await admin.get('/api/v3/access/registrations/count')).body.data.pending).toBe(0);
    const audit = h.dashboardDb.public.many(`SELECT action FROM audit_log WHERE action LIKE 'user.%regist%'`).map((r) => r['action']);
    expect(audit).toEqual(expect.arrayContaining(['user.register', 'user.registration.approve']));
  });

  it('admin reject → tidak bisa login, boleh daftar ulang', async () => {
    await register(form());
    const admin = await loginAs(h, 'admin1');
    const { id, version } = (await admin.get('/api/v3/access/registrations')).body.data[0] as { id: number; version: number };
    expect((await admin.post(`/api/v3/access/registrations/${id}/reject`, { note: 'Bukan karyawan PD', version })).status).toBe(204);
    const rejected = await login();
    expect(rejected.status).toBe(403);
    expect(rejected.body.error.code).toBe('ACCOUNT_REJECTED');
    expect((await admin.get('/api/v3/access/registrations')).body.data).toHaveLength(0);

    const again = await register(form({ password: 'password-baru-12345' }));
    expect(again.status).toBe(202);
    expect(userRow()['status']).toBe('pending');
    expect((await login('calon@example.test', 'password-baru-12345')).body.error.code).toBe('ACCOUNT_PENDING');
    // password lama sudah tidak berlaku
    expect((await login()).status).toBe(401);
  });

  it('akun lama tetap bisa login (default approved)', async () => {
    expect((await login('viewer1@example.test', 'password-rahasia-1')).status).toBe(200);
  });
});
