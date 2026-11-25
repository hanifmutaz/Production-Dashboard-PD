// Semua konfigurasi dari env, divalidasi zod saat start (gagal cepat, pesan jelas). Tidak ada secret hardcode.
import type { ShiftConfig } from '@v3/shared';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');
const hour = z.coerce.number().int().min(0).max(23);
const minutes = z.coerce.number().int().min(0).max(24 * 60);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.preprocess((v) => (typeof v === 'string' ? v.toLowerCase() : v), z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info')),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
    CORS_ORIGIN: z.string().default(''),

    // DB ConMas (read-only, INV-001)
    CONMAS_DATABASE_URL: z.string().min(1, 'CONMAS_DATABASE_URL wajib diisi'),
    DB_VIEW_NAME: z.string().regex(/^[A-Za-z0-9_]+$/).default('view_report_25415'),
    PRODUCTION_MODE_FROM: z.iso.date(),
    REPORT_COLUMNS_PATH: z.string().default('config/reportColumns.js'),

    // DB dashboard (data aplikasi)
    DASHBOARD_DATABASE_URL: z.string().min(1, 'DASHBOARD_DATABASE_URL wajib diisi'),

    SOURCE_NAME: z.enum(['internal', 'sgp', 'systech']).default('internal'),
    SUBCONT_ENABLED: bool,
    SYNC_KEY_SGP: z.string().default(''),
    SYNC_KEY_SYSTECH: z.string().default(''),
    SYNC_STALE_AFTER_SEC: z.coerce.number().int().positive().default(300),

    SESSION_TTL_HOURS: z.coerce.number().int().positive().max(24 * 30).default(12),
    COOKIE_SECURE: bool,
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
    PAIRING_CODE_TTL_MIN: z.coerce.number().int().positive().max(60).default(10),

    SHIFT2_START_HOUR: hour.default(7),
    SHIFT2_END_HOUR_WEEKDAY: hour.default(16),
    SHIFT2_END_HOUR_FRIDAY: hour.default(17),
    SHIFT2_NIGHT_START_HOUR: hour.default(22),
    SHIFT3_START_HOUR: hour.default(6),
    SHIFT3_SECOND_START_HOUR: hour.default(14),
    SHIFT3_THIRD_START_HOUR: hour.default(22),
    LINE_NOT_RUNNING_THRESHOLD_MIN: minutes.default(120),
    LINE_START_GRACE_MIN: minutes.optional(),
    HOURLY_SLOT_OFFSET: z.coerce.number().int().min(-12).max(12).default(0),
    EXECUTIVE_CACHE_SEC: z.coerce.number().int().min(0).default(30),
    WEB_DIST_DIR: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.SUBCONT_ENABLED && (!env.SYNC_KEY_SGP || !env.SYNC_KEY_SYSTECH)) {
      ctx.addIssue({ code: 'custom', message: 'SUBCONT_ENABLED=true butuh SYNC_KEY_SGP dan SYNC_KEY_SYSTECH' });
    }
    if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) {
      ctx.addIssue({ code: 'custom', message: 'Production wajib COOKIE_SECURE=true' });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`).join('\n  ');
    throw new Error(`Konfigurasi env tidak valid:\n  ${detail}`);
  }
  return result.data;
}

export function shiftConfigFromEnv(env: Env): ShiftConfig {
  return {
    shift2StartHour: env.SHIFT2_START_HOUR,
    shift2EndHourWeekday: env.SHIFT2_END_HOUR_WEEKDAY,
    shift2EndHourFriday: env.SHIFT2_END_HOUR_FRIDAY,
    shift2NightStartHour: env.SHIFT2_NIGHT_START_HOUR,
    shift3StartHour: env.SHIFT3_START_HOUR,
    shift3SecondStartHour: env.SHIFT3_SECOND_START_HOUR,
    shift3ThirdStartHour: env.SHIFT3_THIRD_START_HOUR,
    lineNotRunningThresholdMin: env.LINE_NOT_RUNNING_THRESHOLD_MIN,
    // Default grace = threshold (LOGIC_SPEC §2)
    lineStartGraceMin: env.LINE_START_GRACE_MIN ?? env.LINE_NOT_RUNNING_THRESHOLD_MIN,
    hourlySlotOffset: env.HOURLY_SLOT_OFFSET,
  };
}
