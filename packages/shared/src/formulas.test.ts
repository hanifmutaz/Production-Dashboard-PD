import { describe, expect, it } from 'vitest';
import { achievementBand, BAND_LABEL, ppmScore } from './band.js';
import {
  computeAchievement,
  defaultHolidays,
  elapsedWorkingDays,
  elapsedWorkingDaysBefore,
  isWorkingDay,
  normalizeHolidays,
  splitAchievement,
  sumAchievements,
  sumSplitAchievements,
  workingDays,
} from './executive.js';
import { formatNumber, formatPercent } from './format.js';
import {
  bekidoritsu,
  deviasi,
  hourlyAchievement,
  hourlyDeviasi,
  isPercentAnomaly,
  isValidPercent,
  operatorAvailability,
  rejectPpm,
  stoptimeTotal,
  weightedOee,
} from './formulas.js';
import { atHour, eachDate, isIsoDate } from './time.js';

describe('rumus produksi (LOGIC_SPEC §4)', () => {
  it('OQ-006: deviasi = plan − actual di semua halaman (positif = kurang)', () => {
    expect(deviasi(100, 90)).toBe(10);
    expect(deviasi(100, 120)).toBe(-20);
  });
  it('pencapaian per jam bulat, null bila plan ≤ 0 / actual null', () => {
    expect(hourlyAchievement(120, 100)).toBe(83);
    expect(hourlyAchievement(0, 100)).toBeNull();
    expect(hourlyAchievement(100, null)).toBeNull();
    expect(hourlyAchievement(100, 0)).toBe(0);
    expect(hourlyDeviasi(100, null)).toBeNull();
    expect(hourlyDeviasi(100, 0)).toBe(100);
    expect(hourlyDeviasi(120, 100)).toBe(20);
  });
  it('bekidoritsu 1 desimal, plan 0 → 0', () => {
    expect(bekidoritsu(950, 1000)).toBe(95);
    expect(bekidoritsu(1, 3)).toBe(33.3);
    expect(bekidoritsu(500, 0)).toBe(0);
  });
  it('operator availability (actual + reject)/plan, plan 0 → null', () => {
    expect(operatorAvailability(900, 15, 1000)).toBe(91.5);
    expect(operatorAvailability(900, 15, 0)).toBeNull();
    expect(operatorAvailability(null, null, 1000)).toBe(0);
  });
  it('OQ-001: stoptime = jam_target − jam_efektif (menit)', () => {
    expect(stoptimeTotal(480, 450)).toBe(30);
  });
  it('OQ-003: reject PPM = reject / (output + reject) × 1e6 — cocok 20/20 baris DB asli (qty_reject_ppm)', () => {
    // [reject_m107, output_actual, ppm_conmas] dari view_report_25415 (screenshot user 2026-11-25)
    const real: [number, number, number][] = [
      [5, 500, 9901],
      [2, 1068, 1869],
      [2, 4400, 454],
      [72, 4250, 16659],
      [2, 5400, 370],
      [5, 1151, 4325],
      [2, 1020, 1957],
      [2, 1094, 1825],
      [3, 395, 7538],
      [2, 600, 3322],
      [2, 4850, 412],
      [3, 544, 5484],
      [2, 4700, 425],
      [9, 2650, 3385],
      [2, 4750, 421],
      [3, 1105, 2708],
      [2, 338, 5882],
      [2, 64, 30303],
      [2, 867, 2301],
      [2, 1015, 1967],
    ];
    for (const [rej, out, ppm] of real) expect(rejectPpm(rej, out)).toBe(ppm);
    expect(rejectPpm(0, 1000)).toBe(0);
    expect(rejectPpm(0, 0)).toBeNull();
  });
  it('OQ-003: total PPM dari SUM, bukan rata-rata PPM per report', () => {
    // A: 1 reject/100 pcs, B: 0 reject/10.000 pcs → rata-rata PPM = 4950, PPM benar ≈ 99
    expect(rejectPpm(1, 100 + 10000)).toBe(99);
  });
  it('OQ-005: skala 0–100; di luar rentang = anomali', () => {
    expect(isValidPercent(0)).toBe(true);
    expect(isValidPercent(100)).toBe(true);
    expect(isValidPercent(-101)).toBe(false);
    expect(isPercentAnomaly(-101)).toBe(true);
    expect(isPercentAnomaly(100.5)).toBe(true);
    expect(isPercentAnomaly(null)).toBe(false);
  });
  it('OQ-004: OEE berbobot jam_target; anomali & bobot kosong dikeluarkan', () => {
    // 20% × 60 menit + 90% × 480 menit → (1200 + 43200) / 540 = 82,2 (rata-rata biasa = 55)
    expect(
      weightedOee([
        { oee: 20, weight: 60 },
        { oee: 90, weight: 480 },
      ]),
    ).toEqual({ value: 82.2, used: 2, anomalies: 0 });
    expect(
      weightedOee([
        { oee: 90, weight: 480 },
        { oee: -101, weight: 480 },
        { oee: null, weight: 480 },
        { oee: 50, weight: 0 },
        { oee: 50, weight: null },
      ]),
    ).toEqual({ value: 90, used: 1, anomalies: 1 });
    expect(weightedOee([])).toEqual({ value: null, used: 0, anomalies: 0 });
  });
});

describe('kalender kerja (LOGIC_SPEC §5)', () => {
  it('default libur Sabtu & Minggu (Nov 2026 = 9 hari)', () => {
    expect(defaultHolidays(2026, 11)).toHaveLength(9);
    expect(workingDays(2026, 11, defaultHolidays(2026, 11))).toBe(21);
  });
  it('normalisasi membuang tanggal luar bulan, unik, terurut', () => {
    expect(normalizeHolidays(2026, 11, ['2026-11-10', '2026-12-01', '2026-11-03', '2026-11-10', '2026-11-31'])).toEqual([
      '2026-11-03',
      '2026-11-10',
    ]);
  });
  it('elapsed: bulan lampau = semua, bulan depan = 0, bulan berjalan inklusif hari ini', () => {
    const today = atHour('2026-11-24', 10);
    const off = defaultHolidays(2026, 11);
    expect(elapsedWorkingDays(2026, 10, defaultHolidays(2026, 10), today)).toBe(workingDays(2026, 10, defaultHolidays(2026, 10)));
    expect(elapsedWorkingDays(2026, 12, defaultHolidays(2026, 12), today)).toBe(0);
    // 1–24 Nov 2026: 24 hari − 7 akhir pekan (1,7,8,14,15,21,22) = 17
    expect(elapsedWorkingDays(2026, 11, off, today)).toBe(17);
  });
  it('pencapaian & total = jumlah per lokasi', () => {
    const a = computeAchievement({ target: 21000, actual: 15000, workingDays: 21, elapsedWorkingDays: 17 });
    expect(a.dailyTarget).toBe(1000);
    expect(a.targetHariIni).toBe(17000);
    expect(a.gap).toBe(-6000);
    expect(a.gapHariIni).toBe(-2000);
    expect(a.achievementPct).toBe(71.4);
    expect(a.achievementHariIniPct).toBe(88.2);
    const zero = computeAchievement({ target: 0, actual: 10, workingDays: 0, elapsedWorkingDays: 0 });
    expect(zero).toMatchObject({ dailyTarget: 0, targetHariIni: 0, achievementPct: 0 });
    const total = sumAchievements([a, a]);
    expect(total.target).toBe(42000);
    expect(total.targetHariIni).toBe(34000);
    expect(total.achievementPct).toBe(71.4);
  });
});

describe('OQ-014: s/d kemarin + progres hari ini', () => {
  const today = atHour('2026-11-24', 10); // Selasa
  const off = defaultHolidays(2026, 11);
  it('hari kerja sebelum hari ini eksklusif; hari ini working day', () => {
    expect(elapsedWorkingDaysBefore(2026, 11, off, today)).toBe(16);
    expect(elapsedWorkingDaysBefore(2026, 10, defaultHolidays(2026, 10), today)).toBe(workingDays(2026, 10, defaultHolidays(2026, 10)));
    expect(elapsedWorkingDaysBefore(2026, 12, defaultHolidays(2026, 12), today)).toBe(0);
    expect(isWorkingDay('2026-11-24', 2026, 11, off)).toBe(true);
    expect(isWorkingDay('2026-11-22', 2026, 11, off)).toBe(false);
  });
  it('split: target s/d kemarin apple-to-apple; hari ini terpisah', () => {
    const s = splitAchievement({
      dailyTarget: 1000,
      elapsedWorkingDaysBefore: 16,
      actualBeforeToday: 15000,
      actualToday: 400,
      todayInMonth: true,
      todayIsWorkingDay: true,
    });
    expect(s.untilYesterday).toEqual({ target: 16000, actual: 15000, gap: -1000, pct: 93.8 });
    expect(s.today).toEqual({ isWorkingDay: true, target: 1000, actual: 400, pct: 40 });
  });
  it('hari libur → target hari ini 0, pct null; hari kerja pertama → pct s/d kemarin null; bulan lain → today null', () => {
    const holiday = splitAchievement({
      dailyTarget: 1000,
      elapsedWorkingDaysBefore: 0,
      actualBeforeToday: 0,
      actualToday: 50,
      todayInMonth: true,
      todayIsWorkingDay: false,
    });
    expect(holiday.untilYesterday.pct).toBeNull();
    expect(holiday.today).toEqual({ isWorkingDay: false, target: 0, actual: 50, pct: null });
    expect(
      splitAchievement({
        dailyTarget: 1000,
        elapsedWorkingDaysBefore: 21,
        actualBeforeToday: 20000,
        actualToday: 0,
        todayInMonth: false,
        todayIsWorkingDay: false,
      }).today,
    ).toBeNull();
  });
  it('total split = jumlah', () => {
    const a = splitAchievement({
      dailyTarget: 1000,
      elapsedWorkingDaysBefore: 16,
      actualBeforeToday: 15000,
      actualToday: 400,
      todayInMonth: true,
      todayIsWorkingDay: true,
    });
    const t = sumSplitAchievements([a, a]);
    expect(t.untilYesterday).toEqual({ target: 32000, actual: 30000, gap: -2000, pct: 93.8 });
    expect(t.today?.target).toBe(2000);
  });
});

describe('band pencapaian (LOGIC_SPEC §10)', () => {
  it('batas dihitung dari nilai yang sudah dibulatkan 1 desimal', () => {
    expect(achievementBand(99.96)).toBe('green');
    expect(achievementBand(99.94)).toBe('yellow');
    expect(achievementBand(89.95)).toBe('yellow');
    expect(achievementBand(89.94)).toBe('red');
    expect(achievementBand(null)).toBe('none');
    expect(BAND_LABEL.none).toBe('Tanpa target / data');
  });
  it('PPM 0 → hijau; skor dibatasi 1000', () => {
    expect(ppmScore(0, 500).band).toBe('green');
    expect(ppmScore(1000, 500)).toEqual({ score: 50, band: 'red' });
    expect(ppmScore(0.1, 500).score).toBe(1000);
  });
});

describe('format & tanggal', () => {
  it('id-ID & null → —', () => {
    expect(formatNumber(1234567)).toBe('1.234.567');
    expect(formatNumber(12.345, 1)).toBe('12,3');
    expect(formatNumber(null)).toBe('—');
    expect(formatPercent(95.25)).toBe('95,3%');
  });
  it('validasi tanggal ketat & iterasi range', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(eachDate('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
    expect(eachDate('2026-03-02', '2026-03-01')).toEqual([]);
  });
});
