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

/** Kunci settings yang punya skema ketat; kunci lain (tampilan, KPI, dst.) disimpan bebas. */
export const STRICT_SETTINGS: Readonly<Record<string, z.ZodType>> = {
  line_status: lineStatusSchema,
  line_discovery: lineDiscoverySchema,
};

export interface LineDiscoverySettings {
  readonly shift_scheme: ShiftScheme;
  readonly location: Tempat;
}

export const DEFAULT_LINE_DISCOVERY: LineDiscoverySettings = { shift_scheme: 2, location: 'internal' };

export class SettingsService {
  constructor(
    private readonly db: Queryable,
    private readonly defaults: { staleThresholdMin: number },
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

  async lineDiscovery(): Promise<LineDiscoverySettings> {
    const parsed = lineDiscoverySchema.safeParse(await this.raw('line_discovery'));
    return parsed.success ? (parsed.data as LineDiscoverySettings) : DEFAULT_LINE_DISCOVERY;
  }
}
