export const EMPTY_VALUE = '—';

/** Format angka id-ID; null/NaN → "—". */
export function formatNumber(value: number | null | undefined, fractionDigits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY_VALUE;
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatPercent(value: number | null | undefined, fractionDigits = 1): string {
  const s = formatNumber(value, fractionDigits);
  return s === EMPTY_VALUE ? s : `${s}%`;
}
