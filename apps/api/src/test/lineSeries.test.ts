import { beforeEach, describe, expect, it } from 'vitest';
import { loginAs } from './agent.js';
import { createHarness, type Harness } from './harness.js';

type LineOut = { line_code: string; product: string; series: string; version: number };

describe('series line otomatis dari nama produk ConMas', () => {
  let h: Harness;
  let admin: Awaited<ReturnType<typeof loginAs>>;
  const base = { shift: '1', plan: 100, actual: 90 };

  beforeEach(async () => {
    h = await createHarness();
    await h.createUser('admin1', 'admin');
    admin = await loginAs(h, 'admin1');
  });

  const find = (rows: LineOut[], code: string): LineOut => rows.find((l) => l.line_code === code) as LineOut;

  it('series = bagian sebelum "-" pertama dari produk aktif terbaru; line tanpa report → kosong', async () => {
    h.addReports([
      { ...base, line: 'L01', date: '2026-11-23', products: [{ cl: '111', name: 'FX8C-60P-SV4(71)', mo: 'M1', qty: 10 }] },
      // report lebih baru dengan change model: slot terakhir yang terisi yang dipakai
      {
        ...base,
        line: 'L01',
        date: '2026-11-24',
        products: [
          { cl: '111', name: 'FX8C-60P-SV4(71)', mo: 'M1', qty: 10 },
          { cl: '222', name: 'DF13-20P-1.25V(05)', mo: 'M2', qty: 5 },
        ],
      },
      { ...base, line: 'L02', date: '2026-11-24', products: [{ cl: '333', name: 'FX8C-140P-SV2(98)', mo: 'M3', qty: 8 }] },
    ]);
    for (const url of ['/api/v3/lines', '/api/v3/lines/all']) {
      const rows = (await admin.get(url)).body.data as LineOut[];
      expect(find(rows, 'L01')).toMatchObject({ product: '', series: 'DF13' });
      expect(find(rows, 'L02')).toMatchObject({ product: '', series: 'FX8C' });
      expect(find(rows, 'L03')).toMatchObject({ product: '', series: '' });
    }
  });

  it('isian manual "Produk / series" mengalahkan otomatis, dan field product tetap manual', async () => {
    h.addReports([{ ...base, line: 'L01', date: '2026-11-24', products: [{ cl: '111', name: 'FX8C-60P-SV4(71)', mo: 'M1', qty: 10 }] }]);
    const l01 = find((await admin.get('/api/v3/lines/all')).body.data, 'L01');
    expect(l01.series).toBe('FX8C');
    const put = await admin.put('/api/v3/lines/L01', {
      shift_scheme: 2,
      tempat: 'internal',
      product: 'MANUAL',
      version: l01.version,
    });
    expect(put.status).toBe(200);
    expect(find((await admin.get('/api/v3/lines')).body.data, 'L01')).toMatchObject({ product: 'MANUAL', series: 'MANUAL' });
  });
});
