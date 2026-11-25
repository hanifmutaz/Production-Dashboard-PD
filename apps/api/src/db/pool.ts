import pg from 'pg';

export type Row = Record<string, unknown>;

export interface QueryResultLike<R extends Row> {
  readonly rows: R[];
  readonly rowCount: number | null;
}

/** Antarmuka minimal yang dipenuhi pg.Pool, pg.PoolClient, dan adapter pg-mem (tes). */
export interface Queryable {
  query<R extends Row = Row>(text: string, params?: readonly unknown[]): Promise<QueryResultLike<R>>;
}

export interface TxClient extends Queryable {
  release(): void;
}

export interface DbPool extends Queryable {
  connect(): Promise<TxClient>;
  end(): Promise<void>;
}

const NUMERIC_OID = 1700;

/** Parser NUMERIC → number. Nilai non-finite dikembalikan apa adanya (string) agar tidak jadi NaN diam-diam. */
export function parseNumeric(value: string): number | string {
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

/**
 * pg mengembalikan NUMERIC sebagai string. Di DB dashboard (target, cycle_time) itu membuat `a + b` menjadi
 * penggabungan teks di frontend. pg-mem mengembalikan number, jadi bug ini tidak terlihat di tes emulator.
 * Hanya dipasang pada pool dashboard (bukan global) supaya perilaku pool ConMas tidak berubah.
 */
export const dashboardTypes = {
  getTypeParser(oid: number, format?: 'text' | 'binary') {
    return oid === NUMERIC_OID ? parseNumeric : pg.types.getTypeParser(oid, format as 'text');
  },
};

export function createDashboardPool(connectionString: string): DbPool {
  return new pg.Pool({ connectionString, max: 10, types: dashboardTypes }) as unknown as DbPool;
}

/** Transaksi pendek; tidak boleh ada panggilan jaringan lain di dalam fn. */
export async function withTransaction<T>(pool: DbPool, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
