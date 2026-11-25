import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { createDashboardPool, dashboardTypes, parseNumeric } from './pool.js';

describe('pool dashboard: NUMERIC → number', () => {
  it('parser mengubah string numeric menjadi number', () => {
    expect(parseNumeric('60560')).toBe(60560);
    expect(parseNumeric('205.95')).toBe(205.95);
    expect(parseNumeric('0')).toBe(0);
  });

  it('nilai non-finite tidak diam-diam menjadi NaN', () => {
    expect(parseNumeric('NaN')).toBe('NaN');
    expect(parseNumeric('Infinity')).toBe('Infinity');
  });

  it('hanya OID 1700 (NUMERIC) yang diganti; tipe lain tetap bawaan pg', () => {
    expect(dashboardTypes.getTypeParser(1700)('4119')).toBe(4119);
    // int8 (20) sengaja tetap string agar tidak kehilangan presisi
    expect(dashboardTypes.getTypeParser(20)('9007199254740993')).toBe('9007199254740993');
    expect(dashboardTypes.getTypeParser(25)('abc')).toBe('abc');
  });

  it('createDashboardPool memasang parser pada pool, tanpa mengubah parser global pg', async () => {
    const pool = createDashboardPool('postgres://u:p@localhost:5432/x');
    try {
      const opts = (pool as unknown as { options: { types?: unknown } }).options;
      expect(opts.types).toBe(dashboardTypes);
      expect(pg.types.getTypeParser(1700)('1')).toBe('1');
    } finally {
      await pool.end();
    }
  });

  it('regresi: penjumlahan target tidak lagi menjadi penggabungan string', () => {
    const fromDb = ['60560', '4119', '57869', '83112'].map((v) => dashboardTypes.getTypeParser(1700)(v) as number);
    expect(fromDb.reduce((a, b) => a + b, 0)).toBe(205660);
  });
});
