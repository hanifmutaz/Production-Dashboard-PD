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

export function createDashboardPool(connectionString: string): DbPool {
  return new pg.Pool({ connectionString, max: 10 }) as unknown as DbPool;
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
