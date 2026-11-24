import { describe, expect, it } from 'vitest';
import { achievementBand, achievementLabel } from './achievement';
import { fd, fmt, P } from './format';

describe('band & format (port mockup)', () => {
  it('band dari nilai yang dibulatkan 1 desimal', () => {
    expect(achievementBand(99.96)).toBe('ach-green');
    expect(achievementBand(99.94)).toBe('ach-yellow');
    expect(achievementBand(89.94)).toBe('ach-red');
    expect(achievementBand(null)).toBe('');
    expect(achievementLabel(null)).toBe('Tanpa target / data');
  });
  it('format id-ID seperti mockup', () => {
    expect(fmt(14770812)).toBe('14.770.812');
    expect(P(1.5)).toBe('1,5');
    expect(fd('2026-11-09')).toBe('9 November 2026');
  });
});
