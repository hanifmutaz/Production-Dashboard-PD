import { describe, expect, it } from 'vitest';
import { allowedRoute, type Me } from './auth';

const viewer: Me = {
  kind: 'user',
  role: 'viewer',
  name: 'Trial',
  permissions: ['dashboard.view'],
  locations: ['internal', 'sgp', 'systech'],
  menus: [],
  line: null,
  today: '',
  now: '',
};

describe('otorisasi menu dan tautan Settings', () => {
  it('menyembunyikan Settings untuk role tanpa izin, termasuk menu kosong atau tautan eksplisit', () => {
    expect(allowedRoute(viewer, 'settings')).toBe(false);
    expect(allowedRoute({ ...viewer, menus: ['settings'] }, 'settings')).toBe(false);
    expect(allowedRoute(viewer, 'hub')).toBe(true);
  });
  it.each(['config.view', 'config.edit', 'users.manage', 'devices.manage', 'audit.view'])('memeriksa izin %s dan cakupan menu', (p) => {
    expect(allowedRoute({ ...viewer, permissions: [p], menus: ['settings'] }, 'settings')).toBe(true);
    expect(allowedRoute({ ...viewer, permissions: [p], menus: ['hub'] }, 'settings')).toBe(false);
  });
  it.each(['sgp', 'systech'])('scope %s hanya membuka halaman sendiri', (site) => {
    const local = { ...viewer, locations: [site] };
    for (const page of ['master', 'stoptime', 'monitoring-output']) {
      expect(allowedRoute(local, `${page}-${site}`)).toBe(true);
      expect(allowedRoute(local, `${page}-internal`)).toBe(false);
      expect(allowedRoute(local, `${page}-${site === 'sgp' ? 'systech' : 'sgp'}`)).toBe(false);
    }
    expect(allowedRoute({ ...viewer, locations: [] }, 'hub')).toBe(false);
  });
  it('perangkat hanya dapat membuka layar pairing', () => {
    const tv: Me = { ...viewer, kind: 'device', screen: 'hub', permissions: ['config.edit'] };
    expect(allowedRoute(tv, 'settings')).toBe(false);
    expect(allowedRoute(tv, 'hub')).toBe(true);
    expect(allowedRoute({ ...tv, screen: 'line', line: 'L01' }, 'settings')).toBe(false);
  });
});
