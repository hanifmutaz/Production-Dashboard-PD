// Rumus produksi — port persis LOGIC_SPEC §4 & §8. Jangan diubah tanpa keputusan di OPEN_QUESTIONS.

/** Pembulatan 1 desimal gaya dashboard lama: Math.round(x*10)/10. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Deviasi detail line = actual − plan (dihitung dari output, bukan kolom DB). */
export function deviasi(actual: number, plan: number): number {
  return actual - plan;
}

/** ⚠️ Breakdown per line lama memakai PLAN − ACTUAL (kebalikan detail line). Dipertahankan, lihat OQ-006. */
export function breakdownDeviasi(plan: number, actual: number): number {
  return plan - actual;
}

/** Pencapaian per jam (bulat %), null bila plan ≤ 0 atau actual belum diisi. */
export function hourlyAchievement(plan: number | null, actual: number | null): number | null {
  if (plan === null || actual === null || !(plan > 0)) return null;
  return Math.round((actual / plan) * 100);
}

/** Deviasi per jam; null bila salah satu belum diisi (null ≠ 0 untuk per jam). */
export function hourlyDeviasi(plan: number | null, actual: number | null): number | null {
  if (plan === null || actual === null) return null;
  return actual - plan;
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

/** ⚠️ Stoptime total = jam_target − jam_efektif (satuan belum terkonfirmasi, OQ-001). */
export function stoptimeTotal(jamTarget: number, jamEfektif: number): number {
  return jamTarget - jamEfektif;
}

/** ⚠️ OEE agregat lama = rata-rata sederhana baris yang punya data, 1 desimal (OQ-004). Kosong → null. */
export function averageOee(values: readonly (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (present.length === 0) return null;
  return round1(present.reduce((a, b) => a + b, 0) / present.length);
}
