/**
 * Series produk dari nama produk ConMas: bagian sebelum tanda "-" pertama.
 * "FX8C-140P-SV2(98)" → "FX8C". Tanpa "-" → nama tanpa akhiran "(...)". Kosong → null.
 */
export function seriesFromProductName(name: string | null | undefined): string | null {
  if (!name) return null;
  const head = (name.trim().split('-')[0] ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  return head === '' ? null : head;
}
