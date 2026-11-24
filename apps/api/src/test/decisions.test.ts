// Tes keputusan OPEN_QUESTIONS (2026-11-25): OQ-004/005/007/011/012/014/017.
import { describe, expect, it } from 'vitest';
import { createHarness } from './harness.js';
import { loginAs } from './agent.js';

const NOW_1000 = Date.UTC(2026, 10, 24, 3, 0); // 10:00 WIB
const NOW_0830 = Date.UTC(2026, 10, 24, 1, 30); // 08:30 WIB

const complete = {
  line: 'L01',
  date: '2026-11-24',
  shift: 'Shift 1 (2 Shift)',
  plan: 1000,
  actual: 400,
  jamTarget: 480,
  jamEfektif: 450,
  hourly: { 1: [120, 100] as const },
  products: [{ cl: 'CL-A', name: 'PRODUK A', mo: 'MO1', qty: 1000 }],
};

async function setup(now = NOW_1000) {
  const h = await createHarness({ now });
  await h.createUser('admin1', 'admin');
  await h.createUser('super1', 'supervisor');
  return { h, admin: await loginAs(h, 'admin1'), supervisor: await loginAs(h, 'super1') };
}

describe('OQ-011: syarat Running dari Settings', () => {
  it('report belum lengkap (Line Leader kosong): lewat masa tunggu → not_running + missing_fields', async () => {
    const { h, admin } = await setup();
    h.addReports([{ ...complete, lineLeader: null }]);
    const res = await admin.get('/api/v3/reporting/line-detail?line=L01');
    expect(res.body.status).toBe('not_running');
    expect(res.body.data.missing_fields).toEqual(['line_leader']);
  });

  it('report belum lengkap dalam masa tunggu → waiting', async () => {
    const { h, admin } = await setup(NOW_0830);
    h.addReports([{ ...complete, lineLeader: null }]);
    expect((await admin.get('/api/v3/reporting/line-detail?line=L01')).body.status).toBe('waiting');
  });

  it('admin mengubah syarat (tanpa Line Leader) → running; nilai default terlihat di /settings/effective', async () => {
    const { h, admin } = await setup();
    h.addReports([{ ...complete, lineLeader: null }]);
    const eff = await admin.get('/api/v3/settings/effective');
    expect(eff.body.data.line_status.requiredFields).toHaveLength(7);
    const saved = await admin.put('/api/v3/settings/line_status', {
      value: {
        requiredFields: ['cl_no', 'cell_leader', 'teknisi', 'inspector', 'output_plan', 'output_actual'],
        staleEnabled: true,
        staleThresholdMin: 120,
        staleInSummary: true,
      },
    });
    expect(saved.status).toBe(200);
    const res = await admin.get('/api/v3/reporting/line-detail?line=L01');
    expect(res.body.status).toBe('running');
    expect(res.body.data.missing_fields).toEqual([]);
  });

  it('settings tidak valid ditolak 400 (field tak dikenal, threshold di luar batas, kunci asing)', async () => {
    const { admin } = await setup();
    const base = { requiredFields: ['cl_no'], staleEnabled: true, staleThresholdMin: 120, staleInSummary: true };
    expect((await admin.put('/api/v3/settings/line_status', { value: { ...base, requiredFields: ['shoe_size'] } })).status).toBe(400);
    expect((await admin.put('/api/v3/settings/line_status', { value: { ...base, staleThresholdMin: 1 } })).status).toBe(400);
    expect((await admin.put('/api/v3/settings/line_status', { value: { ...base, extra: 1 } })).status).toBe(400);
  });
});

describe('OQ-012: cek stale bisa diatur', () => {
  // Report lengkap tapi output per jam belum diisi sama sekali; 10:00 → slot 07-08 sudah lewat 120 menit.
  const staleReport = { ...complete, hourly: {} };

  it('default: stale → not_running di detail DAN ringkasan (konsisten)', async () => {
    const { h, admin } = await setup();
    h.addReports([staleReport]);
    expect((await admin.get('/api/v3/reporting/line-detail?line=L01')).body.status).toBe('not_running');
    const sum = await admin.get('/api/v3/reporting/summary/current');
    expect(sum.body.data.lines.find((l: { line: string }) => l.line === 'L01').status).toBe('not_running');
  });

  it('staleInSummary=false → ringkasan running, detail tetap not_running', async () => {
    const { h, admin } = await setup();
    h.addReports([staleReport]);
    await admin.put('/api/v3/settings/line_status', {
      value: { requiredFields: ['cl_no'], staleEnabled: true, staleThresholdMin: 120, staleInSummary: false },
    });
    expect((await admin.get('/api/v3/reporting/line-detail?line=L01')).body.status).toBe('not_running');
    const sum = await admin.get('/api/v3/reporting/summary/current');
    expect(sum.body.data.lines.find((l: { line: string }) => l.line === 'L01').status).toBe('running');
  });

  it('staleEnabled=false → running di keduanya', async () => {
    const { h, admin } = await setup();
    h.addReports([staleReport]);
    await admin.put('/api/v3/settings/line_status', {
      value: { requiredFields: ['cl_no'], staleEnabled: false, staleThresholdMin: 120, staleInSummary: true },
    });
    expect((await admin.get('/api/v3/reporting/line-detail?line=L01')).body.status).toBe('running');
  });
});

describe('OQ-004/005/007: agregasi harian', () => {
  it('OEE berbobot jam_target; OEE minus dihitung anomali & dikeluarkan; Sogo/Shugyo/Kikai dijumlah', async () => {
    const { h, admin } = await setup();
    h.addReports([
      { ...complete, oee: 90, jamTarget: 480, sogo: 15, shugyo: 15, kikai: 0 },
      { ...complete, line: 'L02', oee: -101, jamTarget: 480, sogo: 40, shugyo: 40, kikai: 0 },
      { ...complete, line: 'L03', shift: 'Shift 1 (3 Shift)', oee: 50, jamTarget: 60, sogo: 3, shugyo: 3, kikai: 3 },
    ]);
    const res = await admin.get('/api/v3/reporting/summary/daily?date=2026-11-24');
    // (90×480 + 50×60) / 540 = 85,6  (rata-rata biasa lama = 13)
    expect(res.body.data).toMatchObject({ oee: 85.6, oee_anomaly_count: 1, sogo: 58, shugyo: 58, kikai: 3 });
  });

  it('/reporting/reports menandai report anomali, nilai mentah tidak diubah', async () => {
    const { h, supervisor } = await setup();
    h.addReports([{ ...complete, oee: -101 }]);
    const res = await supervisor.get('/api/v3/reporting/reports?start=2026-11-24&end=2026-11-24');
    expect(res.body.data[0]).toMatchObject({ oee: -101, anomaly: true });
    expect(res.body.meta.units).toEqual({ stoptime: 'menit', sogo: 'menit', shugyo: 'menit', kikai: 'menit' });
  });
});

describe('OQ-017: default line baru dari Settings', () => {
  it('line hasil discovery memakai skema shift & lokasi dari line_discovery', async () => {
    const { h, admin } = await setup();
    h.addReports([{ ...complete, line: 'L09' }]);
    expect((await admin.get('/api/v3/lines/discover')).body.data).toEqual(['L09']);
    await admin.put('/api/v3/settings/line_discovery', { value: { shift_scheme: 3, location: 'internal' } });
    const res = await admin.post('/api/v3/lines/sync', {});
    expect(res.body.data).toEqual({ added: ['L09'], defaults: { shift_scheme: 3, location: 'internal' } });
    const row = h.dashboardDb.public.one(`SELECT shift_scheme, location FROM lines WHERE line_code = 'L09'`);
    expect(Number(row['shift_scheme'])).toBe(3);
    expect((await admin.get('/api/v3/lines/discover')).body.data).toEqual([]);
  });
});

describe('OQ-014: Executive s/d kemarin + progres hari ini', () => {
  it('target s/d kemarin vs actual s/d kemarin; hari ini terpisah', async () => {
    const { h, admin } = await setup();
    h.addReports([
      { ...complete, date: '2026-11-03', actual: 15000 },
      { ...complete, actual: 400 },
    ]);
    await admin.put('/api/v3/executive/target', { year: 2026, month: 11, tempat: 'internal', target: 21000 });
    const res = await admin.get('/api/v3/executive/month?year=2026&month=11');
    const internal = res.body.data.locations[0];
    expect(internal.split).toEqual({
      untilYesterday: { target: 16000, actual: 15000, gap: -1000, pct: 93.8 },
      today: { isWorkingDay: true, target: 1000, actual: 400, pct: 40 },
    });
    // Perilaku lama tetap tersedia
    expect(internal.achievement).toMatchObject({ actual: 15400, targetHariIni: 17000 });
    const past = await admin.get('/api/v3/executive/month?year=2026&month=10');
    expect(past.body.data.locations[0].split).toBeNull(); // tanpa target Oktober
  });
});
