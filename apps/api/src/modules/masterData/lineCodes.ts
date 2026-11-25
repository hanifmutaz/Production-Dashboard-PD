// Kode induk berakhir angka. Satu huruf sesudah angka adalah alias historis.
export const parentCodePattern = '^[A-Za-z0-9_-]*[0-9]$';
export const reinspectPattern = 're[ _-]*(insp|insoect|inpect)';
const parent = new RegExp(parentCodePattern);
const reinspect = new RegExp(reinspectPattern, 'i');

export function isProductionLine(code: string): boolean {
  return parent.test(code) && !reinspect.test(code);
}
