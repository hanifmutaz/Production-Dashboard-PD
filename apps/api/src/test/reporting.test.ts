import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './harness.js';
import { loginAs } from './agent.js';

const hourlyFull = (start: number, n: number, plan: number, actual: number | null): Record<number, [number, number | null]> =>
  Object.fromEntries(Array.from({ length: n }, (_, k) => [start + k, [plan, actual]]));

describe('reporting API (fixture pg-mem)', () => {
  let h: Harness;
  let viewer: Awaited<ReturnType<typeof loginAs>>;

  beforeEach(async () => {
    h = await createHarness();
    await h.createUser('viewer1', 'viewer');
    viewer = await loginAs(h, 'viewer1');
    h.addReports([
      // Shift malam kemarin (lintas tanggal) + shift pagi hari ini yang sedang berjalan
      {
        line: 'L01',
        date: '2026-11-23',
        shift: 'Shift 2 (2 Shift)',
        plan: 900,
        actual: 850,
        rejectM107: 5,
        jamTarget: 8,
        jamEfektif: 7.5,
        oee: 80,
        hourly: { 16: [100, 95], 24: [100, 90] },
      },
      {
        line: 'L01',
        date: '2026-11-24',
        shift: 'Shift 1 (2 Shift)',
        plan: 1000,
        actual: 450,
        rejectM107: 10,
        jamTarget: 8,
        jamEfektif: 7,
        oee: 90,
        hourly: { 0: [999, 999], 1: [120, 100], 2: [120, 130], 3: [120, null] },
        products: [
          { cl: 'CL-A', name: 'PRODUK A', mo: 'MO1', qty: 500 },
          { cl: 'CL-B', name: 'PRODUK B', mo: 'MO2', qty: 500 },
        ],
        rejects: [
          { slot: 0, name: 'Burr', qty: 3, kategori: 'Machine', masalah: 'Die aus', minute: 15 },
          { slot: 1, name: 'Dent', qty: 7, kategori: 'Man', minute: 5 },
          { slot: 2, name: 'Burr', qty: 2 },
        ],
      },
      // L02 belum ada report hari ini; L03 3-shift
      {
        line: 'L03',
        date: '2026-11-24',
        shift: 'Shift 1 (3 Shift)',
        plan: 500,
        actual: 500,
        rejectM107: 0,
        jamTarget: 8,
        jamEfektif: 8,
        oee: '',
        hourly: hourlyFull(0, 4, 50, 50),
      },
    ]);
  });

  it('401 tanpa login, 200 setelah login', async () => {
    expect((await request(h.app).get('/api/v3/reporting/line-detail?line=L01')).status).toBe(401);
    expect((await viewer.get('/api/v3/reporting/line-detail?line=L01')).status).toBe(200);
  });

  it('detail line live memilih shift berjalan, rumus LOGIC_SPEC, hourly hanya jam shift (index-based)', async () => {
    const res = await viewer.get('/api/v3/reporting/line-detail?line=L01');
    const d = res.body.data;
    expect(res.body.status).toBe('running');
    expect(d.tanggal).toBe('2026-11-24');
    expect(d.shift).toBe('Shift 1 (2 Shift)');
    expect(d.deviasi_target).toBe(-550);
    expect(d.stoptime_total).toBe(1);
    expect(d.availability_operator).toBe(46);
    expect(d.product_name).toBe('PRODUK B'); // slot terakhir yang terisi
    expect(d.hourly).toHaveLength(9);
    expect(d.hourly[0]).toMatchObject({ slot: 1, label: '07-08', output_plan: 120, output_actual: 100, deviasi: -20, pencapaian: 83 });
    expect(d.hourly[2]).toMatchObject({ slot: 3, output_actual: null, deviasi: null, pencapaian: null });
    // slot 0 (06-07, data 999) bukan milik Shift 1 2-shift → tidak tampil
    expect(d.hourly.some((x: { slot: number }) => x.slot === 0)).toBe(false);
  });

  it('historis: shift malam kemarin memakai slot index 24 untuk 06-07 (bukan index 0)', async () => {
    const res = await viewer.get('/api/v3/reporting/line-detail?line=L01&date=2026-11-23&shift=2');
    const last = res.body.data.hourly.at(-1);
    expect(last).toMatchObject({ slot: 24, label: '06-07', output_actual: 90 });
    expect(res.body.data.historical).toBe(true);
  });

  it('historis shift tidak ada → data null + shift_not_found (bukan shift lain, bukan error)', async () => {
    const res = await viewer.get('/api/v3/reporting/line-detail?line=L01&date=2026-11-24&shift=2');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: null, status: 'shift_not_found' });
    const nd = await viewer.get('/api/v3/reporting/line-detail?line=L01&date=2026-11-20');
    expect(nd.body).toMatchObject({ data: null, status: 'no_data' });
  });

  it('line tanpa report setelah masa tunggu (180 > 120 menit) → not_running', async () => {
    // now 10:00, Shift 1 mulai 07:00 → elapsed 180 > 120 → not_running
    const res = await viewer.get('/api/v3/reporting/line-detail?line=L02');
    expect(res.body).toMatchObject({ data: null, status: 'not_running' });
  });

  it('validasi input → 400 model error seragam; line tak terdaftar → 404', async () => {
    const bad = await viewer.get('/api/v3/reporting/line-detail?line=L01&date=2026-02-30');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatchObject({ code: 'BAD_REQUEST' });
    expect(bad.body.error.requestId).toBeTruthy();
    expect((await viewer.get('/api/v3/reporting/line-detail?line=NOPE')).status).toBe(404);
  });

  it('summary shift berjalan menjumlah report shift aktif saja', async () => {
    const res = await viewer.get('/api/v3/reporting/summary/current');
    expect(res.body.data).toMatchObject({
      lines_total: 3,
      lines_running: 2,
      lines_not_running: 1,
      output_plan: 1500,
      output_actual: 950,
      qty_reject: 10,
      stoptime_total: 1,
      avg_oee: 90,
    });
  });

  it('range trend: hari tanpa data hasData=false; bekidoritsu dari SUM', async () => {
    const res = await viewer.get('/api/v3/reporting/trend/range?start=2026-11-22&end=2026-11-25');
    const days = res.body.data.days;
    expect(days.map((d: { hasData: boolean }) => d.hasData)).toEqual([false, true, true, false]);
    expect(res.body.data.totals).toMatchObject({ plan: 2400, actual: 1800, bekidoritsu: 75 });
  });

  it('breakdown: deviasi = plan − actual (perilaku lama), produk live dari report terbaru', async () => {
    const res = await viewer.get('/api/v3/reporting/breakdown?start=2026-11-23&end=2026-11-24');
    const l01 = res.body.data.lines.find((l: { line_code: string }) => l.line_code === 'L01');
    expect(l01).toMatchObject({ output_plan: 1900, output_actual: 1300, deviasi: 600, bekidoritsu: 68.4, product_name: 'PRODUK B' });
    const l02 = res.body.data.lines.find((l: { line_code: string }) => l.line_code === 'L02');
    expect(l02.days.every((d: { hasData: boolean }) => !d.hasData)).toBe(true);
  });

  it('reject detail agregasi 150 slot, slot kosong difilter, urut terbesar', async () => {
    const res = await viewer.get('/api/v3/reporting/reject?start=2026-11-24&end=2026-11-24');
    expect(res.body.data).toEqual([
      { name: 'Dent', qty: 7 },
      { name: 'Burr', qty: 5 },
    ]);
  });

  it('SGP On Hold: status on_hold, data null, TANPA query ke ConMas', async () => {
    const before = h.conmasQueries.length;
    const res = await viewer.get('/api/v3/reporting/summary/current?location=sgp');
    expect(res.body).toEqual({ data: null, status: 'on_hold' });
    expect(h.conmasQueries.length).toBe(before);
  });

  it('INV-001: semua query ke ConMas adalah SELECT', async () => {
    await viewer.get('/api/v3/reporting/breakdown?start=2026-11-01&end=2026-11-30');
    expect(h.conmasQueries.length).toBeGreaterThan(0);
    expect(h.conmasQueries.every((q) => /^\s*SELECT\b/i.test(q))).toBe(true);
  });
});

describe('kolom mapping yang belum ada di DB (Masalah 70/86)', () => {
  it('dibaca sebagai NULL, tidak error "column does not exist"', async () => {
    const h = await createHarness({ dropColumns: ['cluster_1_1367_t', 'cluster_1_1650_t'] });
    await h.createUser('viewer2', 'viewer');
    const viewer = await loginAs(h, 'viewer2');
    h.addReports([
      {
        line: 'L01',
        date: '2026-11-24',
        shift: 'Shift 1 (2 Shift)',
        plan: 10,
        actual: 10,
        rejects: [{ slot: 69, name: 'X', qty: 1, kategori: 'Man', minute: 3 }],
      },
    ]);
    const res = await viewer.get('/api/v3/reporting/stoptime?start=2026-11-24&end=2026-11-24');
    expect(res.status).toBe(200);
    expect(res.body.data.events).toEqual([{ line: 'L01', date: '2026-11-24', kategori: 'Man', masalah: null, minute: 3 }]);
  });
});

describe('status waiting di awal shift', () => {
  it('line tanpa report ≤ grace → waiting', async () => {
    const h = await createHarness({ now: Date.UTC(2026, 10, 24, 1, 30) }); // 08:30 WIB
    await h.createUser('viewer3', 'viewer');
    const viewer = await loginAs(h, 'viewer3');
    const res = await viewer.get('/api/v3/reporting/line-detail?line=L02');
    expect(res.body).toMatchObject({ data: null, status: 'waiting' });
  });
});
