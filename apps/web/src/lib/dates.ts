// Utilitas tanggal ISO (UTC, tidak geser hari) — port addD/addM/dayList/dm2 mockup.
export const pad = (n: number): string => String(n).padStart(2, '0');
export const isoD = (d: Date): string => d.toISOString().slice(0, 10);
export const addD = (iso: string, n: number): string => isoD(new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5));
export function addM(vm: string, k: number): string {
  const y = Number(vm.slice(0, 4));
  const m = Number(vm.slice(5, 7));
  return isoD(new Date(Date.UTC(y, m - 1 + k, 1))).slice(0, 7);
}
export function dayList(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addD(d, 1)) out.push(d);
  return out;
}
export const dm2 = (s: string): string => `${s.slice(8)}/${s.slice(5, 7)}`;
export const lastOfMonth = (vm: string): string => addD(`${addM(vm, 1)}-01`, -1);
export const MIN_D = '2025-01-01';
export const MIN_M = '2025-01';

export interface Range {
  readonly f: string;
  readonly t: string;
  /** Preset: today, yday, 7d, 30d, mtd, lm, ytd, custom. */
  readonly p: string;
}

export function presetRange(p: string, today: string): Range {
  const n = Number((/^(\d+)d$/.exec(p) ?? [])[1]);
  if (n) return { f: addD(today, -(n - 1)), t: today, p };
  const map: Record<string, [string, string]> = {
    today: [today, today],
    yday: [addD(today, -1), addD(today, -1)],
    mtd: [`${today.slice(0, 7)}-01`, today],
    lm: [`${addM(today.slice(0, 7), -1)}-01`, addD(`${today.slice(0, 7)}-01`, -1)],
    ytd: [`${today.slice(0, 4)}-01-01`, today],
  };
  const r = map[p] ?? map['mtd'];
  return { f: r?.[0] ?? today, t: r?.[1] ?? today, p };
}
