import { describe, expect, it } from 'vitest';
import { loadEnv, shiftConfigFromEnv } from './env.js';

const base = { CONMAS_DATABASE_URL: 'postgres://ro@h/db', DASHBOARD_DATABASE_URL: 'postgres://app@h/dash' };

describe('env schema', () => {
  it('default sesuai LOGIC_SPEC; grace = threshold bila tidak diisi; LOG_LEVEL case-insensitive', () => {
    const env = loadEnv({ ...base, LOG_LEVEL: 'INFO', LINE_NOT_RUNNING_THRESHOLD_MIN: '90' });
    expect(env.SUBCONT_ENABLED).toBe(false);
    expect(env.DB_VIEW_NAME).toBe('view_report_25415');
    expect(shiftConfigFromEnv(env)).toMatchObject({ shift2EndHourFriday: 17, lineNotRunningThresholdMin: 90, lineStartGraceMin: 90 });
  });
  it('gagal cepat dengan pesan jelas', () => {
    expect(() => loadEnv({})).toThrow(/CONMAS_DATABASE_URL/);
    expect(() => loadEnv({ ...base, SUBCONT_ENABLED: 'true' })).toThrow(/SYNC_KEY_SGP/);
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(/COOKIE_SECURE/);
    expect(() => loadEnv({ ...base, DB_VIEW_NAME: 'x; DROP TABLE y' })).toThrow();
  });
});
