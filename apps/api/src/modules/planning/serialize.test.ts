import { describe, expect, it } from 'vitest';
import { serializeTargetRow, toNumber } from './serialize.js';

describe('planning serializer', () => {
  it('target string dari pg diubah menjadi number', () => {
    const row = serializeTargetRow({ line_code: 'L01', target: '60560', work_days: 20, version: 1 });
    expect(row.target).toBe(60560);
    expect(typeof row.target).toBe('number');
    expect(row.line_code).toBe('L01');
  });

  it('target yang sudah number tidak berubah', () => {
    expect(serializeTargetRow({ target: 4119.5 }).target).toBe(4119.5);
  });

  it('sum beberapa baris tetap numerik', () => {
    const rows = ['60560', '4119', '57869'].map((t) => serializeTargetRow({ target: t }));
    expect(rows.reduce((a, r) => a + r.target, 0)).toBe(122548);
  });

  it('nilai tidak valid melempar error, bukan NaN diam-diam', () => {
    expect(() => toNumber('abc')).toThrow(/tidak valid/);
    expect(() => toNumber(undefined)).toThrow();
  });
});
