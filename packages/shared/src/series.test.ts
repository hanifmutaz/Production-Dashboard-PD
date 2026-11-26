import { describe, expect, it } from 'vitest';
import { seriesFromProductName } from './series.js';

describe('seriesFromProductName', () => {
  it.each([
    ['FX8C-140P-SV2(98)', 'FX8C'],
    ['FX8C-80P-SV3(23)', 'FX8C'],
    ['FX8C-60P-SV4(71)', 'FX8C'],
    ['  FX8C-60P-SV4(92) ', 'FX8C'],
    ['DF13-20P-1.25V', 'DF13'],
    ['ABC(12)', 'ABC'],
    ['ABC', 'ABC'],
  ])('%s → %s', (name, series) => expect(seriesFromProductName(name)).toBe(series));

  it.each([[null], [undefined], [''], ['   '], ['-140P'], ['(98)']])('%j → null', (name) => expect(seriesFromProductName(name)).toBeNull());
});
