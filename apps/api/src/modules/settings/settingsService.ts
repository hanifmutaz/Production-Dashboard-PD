// Settings yang dipakai logika (OQ-011, OQ-012, OQ-017). Nilai tidak valid/hilang → default (tidak crash).
import { defaultLineStatusSettings, RUNNING_FIELDS, type LineStatusSettings, type ShiftScheme, type Tempat } from '@v3/shared';
import { z } from 'zod';
import type { Queryable } from '../../db/pool.js';
import { tempat } from '../../http/schemas.js';

export const lineStatusSchema = z
  .object({
    requiredFields: z.array(z.enum(RUNNING_FIELDS)).max(RUNNING_FIELDS.length),
    staleEnabled: z.boolean(),
    staleThresholdMin: z
      .number()
      .int()
      .min(15)
      .max(24 * 60),
    staleInSummary: z.boolean(),
  })
  .strict();

export const lineDiscoverySchema = z
  .object({
    shift_scheme: z.union([z.literal(2), z.literal(3)]),
    location: tempat,
  })
  .strict();

export const kpiSchema = z
  .object({
    yellow: z.number().min(0).max(999),
    green: z.number().min(1).max(1000),
    oee: z.number().min(1).max(100),
    sogo: z.number().min(1).max(100),
    shugyo: z.number().min(1).max(100),
    ppm: z.number().int().min(1).max(1_000_000),
  })
  .strict()
  .refine((k) => k.yellow < k.green, 'Ambang kuning harus di bawah ambang hijau.');

export const displaySchema = z
  .object({
    home: z.enum(['executive', 'hub', 'monitoring-output']),
    theme: z.enum(['system', 'light', 'dark']),
    hub: z.enum(['daily', 'monthly']),
    kioskRefresh: z.number().int().min(5).max(300),
    kioskLine: z.string().max(40),
    investigation: z.enum(['loss', 'output']),
    export: z.enum(['xlsx', 'csv-excel', 'csv-standard', 'tsv', 'json']),
  })
  .strict();

/** Daftar baris generik (Mesin, Produk, Penyebab, Defect, Peringatan): maks 2000 baris, tiap baris punya id & active. */
const rowsSchema = z
  .object({
    rows: z
      .array(
        z
          .object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,70}$/), active: z.boolean() })
          .catchall(z.union([z.string().max(130), z.number(), z.boolean(), z.null()])),
      )
      .max(2000),
  })
  .strict();

/** Kunci settings dengan skema ketat. Kunci lain disimpan bebas (maks 64 KB). */
const hour = z.number().int().min(0).max(23);
const siteShift = z
  .object({
    shift2StartHour: hour,
    shift2EndHourWeekday: hour,
    shift2EndHourFriday: hour,
    shift2NightStartHour: hour,
    shift3StartHour: hour,
    shift3SecondStartHour: hour,
    shift3ThirdStartHour: hour,
    hourlySlotOffset: z.number().int().min(-12).max(12),
  })
  .strict()
  .refine(
    (s) =>
      s.shift2StartHour < s.shift2EndHourWeekday &&
      s.shift2StartHour < s.shift2EndHourFriday &&
      Math.max(s.shift2EndHourWeekday, s.shift2EndHourFriday) <= s.shift2NightStartHour &&
      s.shift3StartHour < s.shift3SecondStartHour &&
      s.shift3SecondStartHour < s.shift3ThirdStartHour,
    'Urutan jam shift tidak valid',
  );
export const STRICT_SETTINGS: Readonly<Record<string, z.ZodType>> = {
  'shift.internal': siteShift,
  'shift.sgp': siteShift,
  'shift.systech': siteShift,
  line_status: lineStatusSchema,
  line_discovery: lineDiscoverySchema,
  'config.kpi': kpiSchema,
  'config.display': displaySchema,
  'config.machines': rowsSchema,
  'config.products': rowsSchema,
  'config.causes': rowsSchema,
  'config.defects': rowsSchema,
  'config.alerts': rowsSchema,
};

export interface LineDiscoverySettings {
  readonly shift_scheme: ShiftScheme;
  readonly location: Tempat;
}

export const DEFAULT_LINE_DISCOVERY: LineDiscoverySettings = { shift_scheme: 2, location: 'internal' };

export class SettingsService {
  constructor(
    private readonly db: Queryable,
    private readonly defaults: { staleThresholdMin: number; shift?: Readonly<Record<string, number>> },
  ) {}

  private async raw(key: string): Promise<unknown> {
    const { rows } = await this.db.query(`SELECT value FROM settings WHERE key = $1`, [key]);
    const v = rows[0]?.['value'];
    if (typeof v === 'string') {
      try {
        return JSON.parse(v) as unknown;
      } catch {
        return undefined;
      }
    }
    return v;
  }

  async lineStatus(): Promise<LineStatusSettings> {
    const parsed = lineStatusSchema.safeParse(await this.raw('line_status'));
    if (!parsed.success) return defaultLineStatusSettings(this.defaults.staleThresholdMin);
    return { ...parsed.data, requiredFields: [...new Set(parsed.data.requiredFields)] };
  }

  async siteShift(site: string) {
    const v = siteShift.safeParse(await this.raw('shift.' + site));
    return v.success
      ? v.data
      : site === 'internal'
        ? {}
        : { shift2StartHour: 8, shift2EndHourWeekday: 20, shift2EndHourFriday: 20, shift2NightStartHour: 20, hourlySlotOffset: 2 };
  }
  shiftConfig(): Readonly<Record<string, number>> {
    return this.defaults.shift ?? {};
  }

  async lineDiscovery(): Promise<LineDiscoverySettings> {
    const parsed = lineDiscoverySchema.safeParse(await this.raw('line_discovery'));
    return parsed.success ? (parsed.data as LineDiscoverySettings) : DEFAULT_LINE_DISCOVERY;
  }
}
