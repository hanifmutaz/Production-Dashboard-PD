// Rumus produksi — LOGIC_SPEC §4 & §8 + keputusan OPEN_QUESTIONS (2026-11-25). Satu-satunya tempat rumus.

/** Pembulatan 1 desimal gaya dashboard lama: Math.round(x*10)/10. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * OQ-006: deviasi = PLAN − ACTUAL di SEMUA halaman (detail line, per jam, breakdown).
 * Positif = kurang dari target, negatif = melebihi target. Label UI: "Kurang (Plan − Actual)".
 */
export function deviasi(plan: number, actual: number): number {
  return plan - actual;
}

/** Pencapaian per jam (bulat %), null bila plan ≤ 0 atau actual belum diisi. */
export function hourlyAchievement(plan: number | null, actual: number | null): number | null {
  if (plan === null || actual === null || !(plan > 0)) return null;
  return Math.round((actual / plan) * 100);
}

/** Deviasi per jam (Plan − Actual); null bila salah satu belum diisi (null ≠ 0 untuk per jam). */
export function hourlyDeviasi(plan: number | null, actual: number | null): number | null {
  if (plan === null || actual === null) return null;
  return deviasi(plan, actual);
}

/** Bekidoritsu output = actual/plan×100, 1 desimal; plan = 0 → 0. Bulanan/range: dari SUM. */
export function bekidoritsu(actual: number, plan: number): number {
  if (plan === 0) return 0;
  return round1((actual / plan) * 100);
}

/** Operator Availability (Beki live) = (actual + reject M107)/plan×100, 1 desimal; plan 0/null → null. */
export function operatorAvailability(actual: number | null, rejectM107: number | null, plan: number | null): number | null {
  if (plan === null || plan === 0) return null;
  return round1((((actual ?? 0) + (rejectM107 ?? 0)) / plan) * 100);
}

/** OQ-001: stoptime total = jam_target − jam_efektif, satuan MENIT (kolom 2918/2919 berisi menit). */
export function stoptimeTotal(jamTargetMin: number, jamEfektifMin: number): number {
  return jamTargetMin - jamEfektifMin;
}

/**
 * OQ-003: Reject PPM gabungan = Σreject M107 / (Σoutput + Σreject M107) × 1.000.000, dibulatkan.
 * Rumus ini identik dengan kolom `qty_reject_ppm` ConMas per report (terverifikasi 20/20 baris DB asli),
 * jadi total harian/bulanan konsisten dengan angka per report. Tanpa output & reject → null.
 * OQ-002: reject = M107 saja (F027/F028 bukan reject in-process).
 */
export function rejectPpm(rejectM107: number, outputActual: number): number | null {
  const base = outputActual + rejectM107;
  if (!(base > 0)) return null;
  return Math.round((rejectM107 / base) * 1_000_000);
}

/** OQ-005: OEE/Availability/Performance/Quality berskala 0–100. Di luar rentang = anomali (salah isi form). */
export function isValidPercent(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 100;
}

export function isPercentAnomaly(value: number | null): boolean {
  return value !== null && Number.isFinite(value) && !isValidPercent(value);
}

export interface WeightedOeeInput {
  readonly oee: number | null;
  /** Bobot = jam_target (menit). */
  readonly weight: number | null;
}

export interface WeightedOee {
  readonly value: number | null;
  /** Jumlah report yang dipakai dalam rata-rata. */
  readonly used: number;
  /** Jumlah report dengan OEE di luar 0–100 (dikeluarkan dari rata-rata). */
  readonly anomalies: number;
}

/**
 * OQ-004: OEE gabungan = Σ(OEE × jam_target) / Σ jam_target, 1 desimal.
 * Dikeluarkan: OEE kosong, OEE di luar 0–100 (dihitung sebagai anomali), jam_target kosong/≤ 0.
 */
export function weightedOee(items: readonly WeightedOeeInput[]): WeightedOee {
  let sum = 0;
  let weight = 0;
  let used = 0;
  let anomalies = 0;
  for (const it of items) {
    if (it.oee === null || !Number.isFinite(it.oee)) continue;
    if (!isValidPercent(it.oee)) {
      anomalies += 1;
      continue;
    }
    if (it.weight === null || !(it.weight > 0)) continue;
    sum += it.oee * it.weight;
    weight += it.weight;
    used += 1;
  }
  return { value: oeeFromWeightedSums(sum, weight), used, anomalies };
}

/** Versi untuk hasil agregasi SQL (Σ OEE×bobot dan Σ bobot sudah dihitung di DB). */
export function oeeFromWeightedSums(weightedSum: number, totalWeight: number): number | null {
  return totalWeight > 0 ? round1(weightedSum / totalWeight) : null;
}
