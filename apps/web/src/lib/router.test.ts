import { describe, expect, it } from 'vitest';
import { legacyRedirect, parseRoute } from './router';

describe('router hash (sama dengan mockup)', () => {
  it('rute dasar & lokasi', () => {
    expect(parseRoute('')).toEqual({ page: 'executive' });
    expect(parseRoute('#hub')).toEqual({ page: 'hub' });
    expect(parseRoute('#master-sgp')).toEqual({ page: 'master', site: 'sgp' });
    expect(parseRoute('#stoptime')).toEqual({ page: 'stoptime', site: 'internal' });
    expect(parseRoute('#breakdown-internal')).toEqual({ page: 'monitoring-output', site: 'internal' });
    expect(parseRoute('#line-41hr121')).toEqual({ page: 'line', line: '41HR121' });
  });
  it('lokasi tak dikenal / rute asing → executive', () => {
    expect(parseRoute('#master-mars')).toEqual({ page: 'executive' });
    expect(parseRoute('#tidak-ada')).toEqual({ page: 'executive' });
  });
  it('redirect URL lama ?view= (bookmark tidak mati)', () => {
    expect(legacyRedirect('?view=hub')).toBe('#hub');
    expect(legacyRedirect('?view=master&tempat=SGP')).toBe('#master-sgp');
    expect(legacyRedirect('?view=breakdown&source=internal')).toBe('#monitoring-output-internal');
    expect(legacyRedirect('?view=master&line=41HR121')).toBe('#line-41hr121');
    expect(legacyRedirect('?x=1')).toBeNull();
  });
});
