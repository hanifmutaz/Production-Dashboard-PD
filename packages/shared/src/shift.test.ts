import { describe, expect, it } from 'vitest';
import { DEFAULT_SHIFT_CONFIG as cfg } from './config.js';
import {
  getLineStatus3,
  getShiftSlotLabels,
  getShiftSlots,
  hourToLabel,
  hourlyIndexAt,
  isRowStale,
  parseShiftLabel,
  pickActiveRow,
  resolveShiftAndDate,
  shiftWindowFromLabel,
  slotLabel,
} from './shift.js';
import { atHour, formatIsoDate } from './time.js';

// WIB Date: field UTC = jam dinding WIB.
const wib = (iso: string, hh: number, mm = 0): Date => new Date(atHour(iso, hh).getTime() + mm * 60000);
const iso = (d: Date): string => d.toISOString();

describe('parseShiftLabel', () => {
  it('parse format standar & variasi spasi/huruf', () => {
    expect(parseShiftLabel('Shift 1 (2 Shift)')).toEqual({ shiftNum: 1, scheme: 2 });
    expect(parseShiftLabel('shift2(3shift)')).toEqual({ shiftNum: 2, scheme: 3 });
  });
  it('teks rusak/kosong/skema tak dikenal → null', () => {
    expect(parseShiftLabel('')).toBeNull();
    expect(parseShiftLabel(null)).toBeNull();
    expect(parseShiftLabel('Pagi')).toBeNull();
    expect(parseShiftLabel('Shift 3 (2 Shift)')).toBeNull();
    expect(parseShiftLabel('Shift 1 (4 Shift)')).toBeNull();
  });
});

describe('resolveShiftAndDate — 2 shift', () => {
  // 2026-11-24 = Selasa, 2026-11-27 = Jumat
  it('jam kerja pagi → Shift 1 hari ini', () => {
    const r = resolveShiftAndDate(wib('2026-11-24', 9), 2, cfg);
    expect(r).toMatchObject({ shift: 'Shift 1 (2 Shift)', tanggal: '2026-11-24' });
    expect(iso(r.shiftStartWIB)).toBe('2026-11-24T07:00:00.000Z');
  });
  it('celah sore 16–22 → Shift 1 yang baru selesai', () => {
    expect(resolveShiftAndDate(wib('2026-11-24', 18), 2, cfg)).toMatchObject({ shiftNum: 1, tanggal: '2026-11-24' });
  });
  it('22:00 ke atas → Shift 2 hari ini', () => {
    expect(resolveShiftAndDate(wib('2026-11-24', 22), 2, cfg)).toMatchObject({ shiftNum: 2, tanggal: '2026-11-24' });
  });
  it('lewat tengah malam (< 07:00) → Shift 2 tanggal kemarin', () => {
    const r = resolveShiftAndDate(wib('2026-11-25', 3), 2, cfg);
    expect(r).toMatchObject({ shift: 'Shift 2 (2 Shift)', tanggal: '2026-11-24' });
    expect(iso(r.shiftStartWIB)).toBe('2026-11-24T22:00:00.000Z');
  });
  it('batas tepat 07:00 → Shift 1 hari ini', () => {
    expect(resolveShiftAndDate(wib('2026-11-25', 7), 2, cfg)).toMatchObject({ shiftNum: 1, tanggal: '2026-11-25' });
  });
  it('tanggal 1 jam 02:00 → kemarin = akhir bulan lalu', () => {
    expect(resolveShiftAndDate(wib('2026-12-01', 2), 2, cfg).tanggal).toBe('2026-11-30');
  });
});

describe('resolveShiftAndDate — 3 shift', () => {
  it.each([
    [6, 1, '2026-11-24'],
    [13, 1, '2026-11-24'],
    [14, 2, '2026-11-24'],
    [21, 2, '2026-11-24'],
    [22, 3, '2026-11-24'],
  ])('jam %i → Shift %i', (h, n, t) => {
    expect(resolveShiftAndDate(wib('2026-11-24', h), 3, cfg)).toMatchObject({ shiftNum: n, tanggal: t });
  });
  it('05:59 → Shift 3 kemarin', () => {
    expect(resolveShiftAndDate(wib('2026-11-25', 5, 59), 3, cfg)).toMatchObject({ shiftNum: 3, tanggal: '2026-11-24' });
  });
});

describe('shiftWindowFromLabel', () => {
  it('Shift 1 (2) hari biasa berakhir 16:00, Jumat 17:00', () => {
    expect(iso(shiftWindowFromLabel('2026-11-24', 2, 1, cfg)!.endWIB)).toBe('2026-11-24T16:00:00.000Z');
    expect(iso(shiftWindowFromLabel('2026-11-27', 2, 1, cfg)!.endWIB)).toBe('2026-11-27T17:00:00.000Z');
  });
  it('Shift malam berakhir di hari berikutnya (lintas bulan)', () => {
    const w = shiftWindowFromLabel('2026-11-30', 2, 2, cfg)!;
    expect(iso(w.startWIB)).toBe('2026-11-30T22:00:00.000Z');
    expect(iso(w.endWIB)).toBe('2026-12-01T07:00:00.000Z');
    expect(iso(shiftWindowFromLabel('2026-11-30', 3, 3, cfg)!.endWIB)).toBe('2026-12-01T06:00:00.000Z');
  });
  it('shift di luar skema → null', () => {
    expect(shiftWindowFromLabel('2026-11-24', 2, 3, cfg)).toBeNull();
    expect(shiftWindowFromLabel('bukan-tanggal', 2, 1, cfg)).toBeNull();
  });
});

describe('hourToLabel & slot', () => {
  it('format dua digit, jam 0 → 24-1, jam 23 → 23-24', () => {
    expect(hourToLabel(6)).toBe('06-07');
    expect(hourToLabel(0)).toBe('24-1');
    expect(hourToLabel(23)).toBe('23-24');
    expect(hourToLabel(24)).toBe('24-1');
  });
  it('slot index 0 dan 24 berlabel sama (lookup harus pakai index)', () => {
    expect(slotLabel(0, 0)).toBe('06-07');
    expect(slotLabel(24, 0)).toBe('06-07');
    expect(slotLabel(18, 0)).toBe('24-1');
    expect(slotLabel(0, 1)).toBe('07-08');
  });
  it('hourlyIndexAt: jam 06:00 besok pada report shift malam → index 24, bukan 0', () => {
    expect(hourlyIndexAt('2026-11-24', wib('2026-11-24', 6), 0)).toBe(0);
    expect(hourlyIndexAt('2026-11-24', wib('2026-11-25', 6), 0)).toBe(24);
    expect(hourlyIndexAt('2026-11-24', wib('2026-11-25', 7), 0)).toBeNull();
    expect(hourlyIndexAt('2026-11-24', wib('2026-11-24', 5), 0)).toBeNull();
  });
});

describe('getShiftSlotLabels / getShiftSlots', () => {
  it('2 shift Shift 1 Selasa = 9 jam 07-08..15-16; Jumat 10 jam', () => {
    const tue = getShiftSlotLabels(2, 1, 2, cfg);
    expect(tue).toHaveLength(9);
    expect(tue[0]).toBe('07-08');
    expect(tue.at(-1)).toBe('15-16');
    expect(getShiftSlotLabels(2, 1, 5, cfg).at(-1)).toBe('16-17');
  });
  it('Shift malam melewati 24-1', () => {
    expect(getShiftSlotLabels(2, 2, 2, cfg)).toEqual(['22-23', '23-24', '24-1', '01-02', '02-03', '03-04', '04-05', '05-06', '06-07']);
  });
  it('Slot shift malam 2-shift memakai index 16..24', () => {
    const slots = getShiftSlots('2026-11-24', 2, 2, cfg);
    expect(slots.map((s) => s.index)).toEqual([16, 17, 18, 19, 20, 21, 22, 23, 24]);
    expect(slots.at(-1)).toEqual({ index: 24, label: '06-07' });
  });
});

describe('isRowStale', () => {
  const base = {
    reportDate: '2026-11-24',
    shiftStartWIB: wib('2026-11-24', 7),
    thresholdMin: 120,
    hourlySlotOffset: 0,
  };
  const empty: (number | null)[] = Array.from({ length: 25 }, () => null);
  it('belum ada slot due → tidak stale', () => {
    expect(isRowStale({ ...base, hourlyActual: empty, nowWIB: wib('2026-11-24', 8, 30) })).toBe(false);
  });
  it('ada slot due dan semuanya null → stale', () => {
    expect(isRowStale({ ...base, hourlyActual: empty, nowWIB: wib('2026-11-24', 10) })).toBe(true);
  });
  it('salah satu slot due terisi (termasuk 0) → tidak stale', () => {
    const h = [...empty];
    h[1] = 0; // index 1 = 07-08
    expect(isRowStale({ ...base, hourlyActual: h, nowWIB: wib('2026-11-24', 12) })).toBe(false);
  });
});

describe('pickActiveRow', () => {
  const rows = [
    { id: 'a', tanggal: '2026-11-23', shift: 'Shift 2 (2 Shift)' },
    { id: 'b', tanggal: '2026-11-24', shift: 'Shift 1 (2 Shift)' },
    { id: 'c', tanggal: '2026-11-24', shift: 'Shift 2 (2 Shift)' },
    { id: 'x', tanggal: '2026-11-24', shift: 'rusak' },
  ];
  it('live: baris yang jendelanya mencakup sekarang', () => {
    expect(pickActiveRow(rows, wib('2026-11-24', 10), cfg)?.id).toBe('b');
    expect(pickActiveRow(rows, wib('2026-11-24', 3), cfg)?.id).toBe('a');
    expect(pickActiveRow(rows, wib('2026-11-24', 23), cfg)?.id).toBe('c');
  });
  it('live celah: baris yang paling baru selesai', () => {
    expect(pickActiveRow(rows, wib('2026-11-24', 18), cfg)?.id).toBe('b');
  });
  it('live: baris shift yang belum mulai tidak dipilih', () => {
    expect(pickActiveRow([rows[2]!], wib('2026-11-24', 10), cfg)).toBeNull();
  });
  it('historis: hanya tanggal persis; >1 → jendela akhir paling akhir', () => {
    expect(pickActiveRow(rows, wib('2026-11-24', 23, 59), cfg, { exactDate: '2026-11-24' })?.id).toBe('c');
    expect(pickActiveRow(rows, wib('2026-11-22', 23, 59), cfg, { exactDate: '2026-11-22' })).toBeNull();
  });
  it('historis + shift override: harus persis, kalau tidak ada → null', () => {
    expect(pickActiveRow(rows, wib('2026-11-24', 23, 59), cfg, { exactDate: '2026-11-24', shiftOverride: 1 })?.id).toBe('b');
    expect(pickActiveRow(rows, wib('2026-11-24', 23, 59), cfg, { exactDate: '2026-11-24', shiftOverride: 3 })).toBeNull();
  });
  it('baris tanggal lain tidak pernah dipakai sebagai tanggal yang diminta', () => {
    const picked = pickActiveRow(rows, wib('2026-11-23', 23, 59), cfg, { exactDate: '2026-11-23' });
    expect(picked?.tanggal).toBe('2026-11-23');
  });
});

describe('getLineStatus3', () => {
  const live = { historical: false, shiftRequested: false, graceMin: 120, stale: false };
  it('tanpa baris dalam masa tunggu → waiting; lewat → not_running', () => {
    expect(getLineStatus3({ ...live, hasRow: false, elapsedMin: 120 })).toBe('waiting');
    expect(getLineStatus3({ ...live, hasRow: false, elapsedMin: 121 })).toBe('not_running');
  });
  it('ada baris: stale → not_running; tidak → running', () => {
    expect(getLineStatus3({ ...live, hasRow: true, elapsedMin: 300, stale: true })).toBe('not_running');
    expect(getLineStatus3({ ...live, hasRow: true, elapsedMin: 300 })).toBe('running');
  });
  it('historis: no_data / shift_not_found', () => {
    expect(getLineStatus3({ ...live, historical: true, hasRow: false, elapsedMin: 0 })).toBe('no_data');
    expect(getLineStatus3({ ...live, historical: true, shiftRequested: true, hasRow: false, elapsedMin: 0 })).toBe('shift_not_found');
  });
});

describe('time utils (INV-003: tidak geser hari)', () => {
  it('format tanggal tetap sama setelah parse', () => {
    expect(formatIsoDate(atHour('2026-01-01', 0))).toBe('2026-01-01');
  });
});
