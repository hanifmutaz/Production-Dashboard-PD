// Penerima push-sync SGP/Systech (LOGIC_SPEC §1). Dibangun, tetapi nonaktif selama SUBCONT_ENABLED=false.
import { dayPayload } from './day.js';
import { withTransaction } from '../../db/pool.js';
import { parseShiftLabel } from '@v3/shared';
import { timingSafeEqual } from 'node:crypto';
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AppError, parseInput, unauthorized } from '../../http/errors.js';
import { requirePermission } from '../../http/auth.js';
import type { DbPool } from '../../db/pool.js';

export interface SyncConfig {
  readonly enabled: boolean;
  readonly keys: Readonly<Record<'sgp' | 'systech', string>>;
  readonly staleAfterSec: number;
}

const body = z.object({
  source: z.enum(['sgp', 'systech']),
  type: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  timestamp: z.string().datetime({ offset: true }),
  data: z.unknown(),
});

function keyMatches(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/** Simpan snapshot hanya bila lebih baru (INV-007, atomik dalam satu statement). Return true bila diterima. */
export async function storeSnapshot(
  db: Pick<DbPool, 'query'>,
  s: { source: string; type: string; timestamp: string; data: unknown },
): Promise<boolean> {
  const { rows } = await db.query(
    `INSERT INTO push_snapshots (source, type, payload_timestamp, data) VALUES ($1, $2, $3, $4)
     ON CONFLICT (source, type) DO UPDATE SET payload_timestamp = EXCLUDED.payload_timestamp, data = EXCLUDED.data, received_at = now()
     WHERE push_snapshots.payload_timestamp < EXCLUDED.payload_timestamp
     RETURNING payload_timestamp`,
    [s.source, s.type, s.timestamp, JSON.stringify(s.data ?? null)],
  );
  // Postgres tidak mengembalikan baris bila WHERE gagal; cek nilai tersimpan sebagai pengaman tambahan.
  const stored = rows[0]?.['payload_timestamp'];
  return (
    stored !== undefined && (stored instanceof Date ? stored.getTime() : Date.parse(String(stored))) === new Date(s.timestamp).getTime()
  );
}

export function syncRoutes(pool: DbPool, cfg: SyncConfig): Router {
  const r = Router();
  const disabled = (): AppError => new AppError(503, 'SUBCONT_DISABLED', 'Sinkronisasi subcont sedang On Hold');

  r.post(
    '/',
    rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }),
    express.json({ limit: '10mb' }),
    async (req, res, next) => {
      try {
        if (!cfg.enabled) throw disabled();
        const b = parseInput(body, req.body);
        if (!keyMatches(cfg.keys[b.source], req.get('x-sync-key') ?? '')) throw unauthorized('x-sync-key tidak valid');
        const day = b.type.startsWith('production-day-') ? parseInput(dayPayload, b.data) : null;
        if (day && b.type !== 'production-day-' + day.date) throw new AppError(400, 'INVALID_DATE', 'Tanggal snapshot berbeda');
        const accepted = await withTransaction(pool, async (tx) => {
          const saved = await storeSnapshot(tx, { ...b, data: day ?? b.data });
          if (saved && day) {
            const schemes = new Map(day.details.map((r) => [r.line, parseShiftLabel(r.shift)?.scheme ?? 2]));
            for (const [code, scheme] of schemes) {
              await tx.query('INSERT INTO lines(line_code,location,shift_scheme) VALUES($1,$2,$3) ON CONFLICT(line_code) DO NOTHING', [
                code,
                b.source,
                scheme,
              ]);
            }
            if (schemes.size) {
              const { rows } = await tx.query('SELECT line_code FROM lines WHERE line_code = ANY($1::text[]) AND location <> $2', [
                Array.from(schemes.keys()),
                b.source,
              ]);
              if (rows.length) throw new AppError(409, 'LINE_CONFLICT', 'Kode line sudah terdaftar di lokasi lain');
            }
          }
          await tx.query(
            `INSERT INTO push_status (source, last_received, last_accepted, last_rejected, rejected_count)
         VALUES ($1, now(), CASE WHEN $2 THEN now() END, CASE WHEN $2 THEN NULL ELSE now() END, CASE WHEN $2 THEN 0 ELSE 1 END)
         ON CONFLICT (source) DO UPDATE SET last_received = now(),
           last_accepted = CASE WHEN $2 THEN now() ELSE push_status.last_accepted END,
           last_rejected = CASE WHEN $2 THEN push_status.last_rejected ELSE now() END,
           rejected_count = push_status.rejected_count + CASE WHEN $2 THEN 0 ELSE 1 END`,
            [b.source, saved],
          );
          return saved;
        });
        // Snapshot lama tetap dijawab OK agar pengirim tidak retry selamanya.
        res.json({ ok: true, accepted });
      } catch (e) {
        next(e);
      }
    },
  );

  r.get('/status', requirePermission('dashboard.view'), async (_req, res, next) => {
    try {
      if (!cfg.enabled) return void res.json({ data: null, status: 'on_hold' });
      const { rows } = await pool.query(`SELECT * FROM push_status ORDER BY source`);
      const now = Date.now();
      res.json({
        data: rows.map((s) => {
          const last = s['last_accepted'] ? new Date(String(s['last_accepted'])).getTime() : null;
          return { ...s, stale: last === null || now - last > cfg.staleAfterSec * 1000 };
        }),
        status: 'ok',
      });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
