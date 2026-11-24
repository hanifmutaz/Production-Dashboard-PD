import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { createHarness } from './harness.js';
import { loginAs } from './agent.js';

const base = { start: '2026-11-23', end: '2026-11-24', locations: ['internal', 'sgp'] };

async function setup() {
  const h = await createHarness();
  await h.createUser('super1', 'supervisor');
  h.addReports([
    {
      line: 'L01',
      date: '2026-11-24',
      shift: 'Shift 1 (2 Shift)',
      plan: 1000,
      actual: 900,
      rejectM107: 10,
      jamTarget: 480,
      jamEfektif: 450,
      oee: 80,
      hourly: { 1: [120, 100] },
      products: [{ cl: 'CL-A', name: '=HYPERLINK("x")', mo: 'MO1', qty: 900 }],
      rejects: [{ slot: 0, name: 'Burr', qty: 10, kategori: 'Machine', masalah: 'Die aus', minute: 30 }],
    },
    { line: 'L02', date: '2026-11-23', shift: 'Shift 2 (2 Shift)', plan: 500, actual: 500 },
  ]);
  return { h, sup: await loginAs(h, 'super1') };
}

describe('export dataset mockup (server-side)', () => {
  it('preview line_day: kolom & baris sesuai spesifikasi, deviasi = plan − actual, SGP tidak menghasilkan baris', async () => {
    const { sup } = await setup();
    const res = await sup.post('/api/v3/export/preview', {
      ...base,
      ds: 'line_day',
      agg: 'day',
      columns: ['tgl', 'lok', 'line', 'pl', 'ac', 'dev', 'beki', 'st'],
    });
    expect(res.body.data.columns).toEqual([
      'Tanggal',
      'Lokasi',
      'Line',
      'Output plan',
      'Output actual',
      'Deviasi (Plan − Actual)',
      'Bekidoritsu (%)',
      'Stoptime (menit)',
    ]);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.rows).toContainEqual(['2026-11-24', 'Hirose Internal', 'L01', 1000, 900, 100, 90, 30]);
  });

  it('total periode (agg=tot) & filter line', async () => {
    const { sup } = await setup();
    const res = await sup.post('/api/v3/export/preview', {
      ...base,
      ds: 'line_day',
      agg: 'tot',
      lines: 'l02',
      columns: ['tgl', 'line', 'ac'],
    });
    expect(res.body.data.rows).toEqual([['2026-11-23 s/d 2026-11-24', 'L02', 500]]);
  });

  it('per jam, per shift (filter shift), per produk, stoptime, reject', async () => {
    const { sup } = await setup();
    const hour = await sup.post('/api/v3/export/preview?limit=40', {
      ...base,
      ds: 'line_hour',
      columns: ['line', 'shift', 'jam', 'pl', 'ac', 'dev', 'pct'],
    });
    expect(hour.body.data.rows).toContainEqual(['L01', 'Shift 1', '07-08', 120, 100, 20, 83]);
    const shift = await sup.post('/api/v3/export/preview', { ...base, ds: 'line_shift', shift: '2', columns: ['line', 'shift', 'ac'] });
    expect(shift.body.data.rows).toEqual([['L02', 'Shift 2', 500]]);
    const prod = await sup.post('/api/v3/export/preview', { ...base, ds: 'line_product', columns: ['cl', 'prod', 'qty'] });
    expect(prod.body.data.rows).toEqual([['CL-A', '=HYPERLINK("x")', 900]]);
    const stop = await sup.post('/api/v3/export/preview', { ...base, ds: 'stop', columns: ['no', 'line', 'kat', 'sebab', 'dur'] });
    expect(stop.body.data.rows).toEqual([[1, 'L01', 'Machine', 'Die aus', 30]]);
    const rej = await sup.post('/api/v3/export/preview', { ...base, ds: 'rej', columns: ['line', 'defect', 'qty'] });
    expect(rej.body.data.rows).toEqual([['L01', 'Burr', 10]]);
  });

  it('unduh: CSV Excel (; + BOM), CSV standar, TSV, JSON, XLSX; formula injection dinetralkan; tercatat di audit', async () => {
    const { h, sup } = await setup();
    const body = { ...base, ds: 'line_product', columns: ['line', 'prod', 'qty'] };
    const csvx = await sup.post('/api/v3/export', { ...body, format: 'csv-excel' });
    expect(csvx.text.startsWith('\uFEFFLine No;Nama produk;Qty (pcs)')).toBe(true);
    expect(csvx.text).toContain(`L01;"'=HYPERLINK(""x"")";900`);
    const csv = await sup.post('/api/v3/export', { ...body, format: 'csv-standard' });
    expect(csv.text.startsWith('Line No,Nama produk')).toBe(true);
    const tsv = await sup.post('/api/v3/export', { ...body, format: 'tsv', name: 'laporan produk' });
    expect(tsv.headers['content-disposition']).toContain('laporan_produk.tsv');
    const json = await sup.post('/api/v3/export', { ...body, format: 'json' });
    expect(JSON.parse(json.text)).toEqual([{ 'Line No': 'L01', 'Nama produk': '=HYPERLINK("x")', 'Qty (pcs)': 900 }]);
    const xlsx = await sup.raw
      .post('/api/v3/export')
      .set('x-v3-csrf', '1')
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .send({ ...body, format: 'xlsx' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.body as never);
    expect(wb.worksheets[0]?.getRow(2).values).toEqual([undefined, 'L01', `'=HYPERLINK("x")`, 900]);
    expect(h.dashboardDb.public.many(`SELECT action FROM audit_log WHERE action = 'export.run'`).length).toBe(5);
  });

  it('ringkasan executive per bulan', async () => {
    const { sup } = await setup();
    const res = await sup.post('/api/v3/export/preview', {
      ...base,
      ds: 'exec',
      period: '2026-11',
      columns: ['lok', 'daily', 'actual', 'days'],
    });
    expect(res.body.data.rows).toEqual([['Hirose Internal', 900, 1400, 21]]);
  });

  it('validasi: dataset tak dikenal, tanpa lokasi, nama file aneh → 400', async () => {
    const { sup } = await setup();
    expect((await sup.post('/api/v3/export/preview', { ...base, ds: 'x', columns: ['a'] })).status).toBe(400);
    expect((await sup.post('/api/v3/export/preview', { ...base, locations: [], ds: 'rej', columns: ['qty'] })).status).toBe(400);
    expect((await sup.post('/api/v3/export', { ...base, ds: 'rej', columns: ['qty'], name: '../x' })).status).toBe(400);
  });
});
