import { describe, expect, it } from 'vitest';
import { createHarness } from './harness.js';
import { loginAs } from './agent.js';
import { validLocationScope } from '@v3/shared';

describe('location isolation', () => {
  it('scope kosong, duplikat dan campuran dua lokasi tidak valid', () => {
    expect(validLocationScope([])).toBe(false);
    expect(validLocationScope(['sgp', 'systech'])).toBe(false);
    expect(validLocationScope(['sgp', 'sgp', 'internal'])).toBe(false);
    expect(validLocationScope(['sgp'])).toBe(true);
    expect(validLocationScope(['internal', 'sgp', 'systech'])).toBe(true);
  });

  it.each(['sgp', 'systech'])('admin %s tidak dapat membaca atau mengubah lokasi lain', async (site) => {
    const h = await createHarness();
    const foreign = site === 'sgp' ? 'systech' : 'sgp';
    await h.createUser('local1', 'admin', 'password-rahasia-1', [site]);
    const foreignId = await h.createUser('foreign1', 'viewer', 'password-rahasia-1', [foreign]);
    await h.createUser('central1', 'admin');
    const local = await loginAs(h, 'local1');
    const central = await loginAs(h, 'central1');
    const scoped = await local.get('/api/v3/sites');
    expect(scoped.status).toBe(200);
    expect(Object.keys(scoped.body.data)).toEqual([site]);
    expect(Object.keys((await central.get('/api/v3/sites')).body.data).sort()).toEqual(['internal', 'sgp', 'systech']);
    for (const other of ['internal', foreign]) {
      expect((await local.get(`/api/v3/reporting/summary/current?location=${other}`)).status).toBe(403);
    }
    const executive = await local.get('/api/v3/executive/month?year=2026&month=11');
    expect(executive.status).toBe(200);
    expect(executive.body.data.locations.map((row: { tempat: string }) => row.tempat)).toEqual([site]);
    const users = await local.get('/api/v3/access/users');
    expect(users.status).toBe(200);
    expect(users.body.data.map((row: { locations: string[] }) => row.locations)).toEqual([[site]]);
    expect((await local.patch(`/api/v3/access/users/${foreignId}`, { role: 'viewer', version: 1 })).status).toBe(403);
    expect((await local.post('/api/v3/access/users', {
      email: 'new@example.test', display_name: 'New', password: 'password-panjang-1', role: 'viewer', locations: [foreign],
    })).status).toBe(403);
    expect((await local.get('/api/v3/access/registrations')).status).toBe(403);
    expect((await local.get('/api/v3/access/audit')).status).toBe(403);
    expect((await local.get('/api/v3/lines/discover')).status).toBe(403);
  });
});
