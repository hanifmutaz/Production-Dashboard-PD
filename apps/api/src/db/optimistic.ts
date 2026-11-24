import type { Queryable, Row } from './pool.js';
import { conflict } from '../http/errors.js';

const EXISTS_MESSAGE = 'Data untuk kunci ini sudah ada. Muat ulang untuk mendapatkan versi terbaru.';

/** Pelanggaran unique/PK (Postgres SQLSTATE 23505). */
export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = 'code' in err ? String(err.code) : '';
  const message = 'message' in err ? String(err.message) : '';
  return code === '23505' || /duplicate key/i.test(message);
}

/**
 * Simpan dengan optimistic locking (INV-006):
 * - version tidak dikirim → INSERT polos; unique violation → 409 (jangan timpa diam-diam).
 * - version dikirim → UPDATE ... WHERE version = $v; 0 baris → 409.
 */
export async function saveVersioned<R extends Row>(
  db: Queryable,
  opts: {
    readonly version: number | undefined;
    readonly insertSql: string;
    readonly insertParams: readonly unknown[];
    readonly updateSql: string;
    readonly updateParams: readonly unknown[];
  },
): Promise<R> {
  if (opts.version === undefined) {
    try {
      const { rows } = await db.query<R>(opts.insertSql, opts.insertParams);
      const row = rows[0];
      if (!row) throw conflict(EXISTS_MESSAGE);
      return row;
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict(EXISTS_MESSAGE);
      throw err;
    }
  }
  const { rows } = await db.query<R>(opts.updateSql, [...opts.updateParams, opts.version]);
  const row = rows[0];
  if (!row) throw conflict();
  return row;
}
