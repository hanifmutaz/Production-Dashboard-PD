import { round1 } from './formulas.js';

export type Band = 'green' | 'yellow' | 'red' | 'none';

export interface BandThresholds {
  readonly yellow: number;
  readonly green: number;
}

export const DEFAULT_ACHIEVEMENT_THRESHOLDS: BandThresholds = { yellow: 90, green: 100 };

export const BAND_LABEL: Readonly<Record<Band, string>> = {
  green: 'Tercapai',
  yellow: 'Mendekati target',
  red: 'Di bawah target',
  none: 'Tanpa target / data',
};

/** Band dihitung dari nilai yang SUDAH dibulatkan 1 desimal (warna & angka berubah di batas yang sama). */
export function achievementBand(pct: number | null, t: BandThresholds = DEFAULT_ACHIEVEMENT_THRESHOLDS): Band {
  if (pct === null || !Number.isFinite(pct)) return 'none';
  const v = round1(pct);
  if (v >= t.green) return 'green';
  if (v >= t.yellow) return 'yellow';
  return 'red';
}

export interface PpmScore {
  readonly score: number | null;
  readonly band: Band;
}

/** Skor PPM: ppm 0 → hijau; selain itu min(1000, target/ppm×100) lalu band biasa. */
export function ppmScore(ppm: number | null, targetPpm: number, t: BandThresholds = DEFAULT_ACHIEVEMENT_THRESHOLDS): PpmScore {
  if (ppm === null || !Number.isFinite(ppm)) return { score: null, band: 'none' };
  if (ppm === 0) return { score: null, band: 'green' };
  const score = Math.min(1000, (targetPpm / ppm) * 100);
  return { score, band: achievementBand(score, t) };
}
