import { describe, expect, it } from 'vitest';
import { achievementBand, BAND_LABEL, ppmScore } from './band.js';
import { computeAchievement, defaultHolidays, elapsedWorkingDays, normalizeHolidays, sumAchievements, workingDays } from './executive.js';
import { formatNumber, formatPercent } from './format.js';
import {
  averageOee,
  bekidoritsu,
  breakdownDeviasi,
  deviasi,
  hourlyAchievement,
  hourlyDeviasi,
  operatorAvailability,
  stoptimeTotal,
} from './formulas.js';
import { atHour, eachDate, isIsoDate } from './time.js';

describe('rumus produksi (LOGIC_SPEC §4)', () => {
  it('deviasi detail = actual − plan; breakdown = plan − actual', () => {
    expect(deviasi(90, 100)).toBe(-10);
    expect(breakdownDeviasi(100, 90)).toBe(10);
  });
  it('pencapaian per jam bulat, null bila plan ≤ 0 / actual null', () => {
    expect(hourlyAchievement(120, 100)).toBe(83);
    expect(hourlyAchievement(0, 100)).toBeNull();
    expect(hourlyAchievement(100, null)).toBeNull();
    expect(hourlyAchievement(100, 0)).toBe(0);
    expect(hourlyDeviasi(100, null)).toBeNull();
    expect(hourlyDeviasi(100, 0)).toBe(-100);
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
  it('stoptime = jam_target − jam_efektif', () => {
    expect(stoptimeTotal(8, 7.5)).toBe(0.5);
  });
  it('OEE rata-rata sederhana atas baris yang punya data', () => {
    expect(averageOee([80, null, 90])).toBe(85);
    expect(averageOee([null])).toBeNull();
    expect(averageOee([])).toBeNull();
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
