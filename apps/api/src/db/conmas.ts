// Akses DB ConMas — read-only berlapis (INV-001):
// 1) akun DB read-only (deployment), 2) sesi default_transaction_read_only=on, 3) guard SELECT-only di sini.
import pg from 'pg';
import type { DbPool, QueryResultLike, Row } from './pool.js';

const SELECT_ONLY = /^\s*(SELECT|WITH)\b/i;
const FORBIDDEN = /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|COPY|CALL|DO|VACUUM|REINDEX|LOCK|SET)\b/i;

export class ReadOnlyViolation extends Error {
  constructor() {
    super('Query non-SELECT ditolak pada koneksi ConMas (read-only)');
    this.name = 'ReadOnlyViolation';
  }
}

export function assertReadOnlySql(sql: string): void {
  // Hapus literal string agar kata seperti 'Delete' di data tidak memicu false positive.
  const stripped = sql.replace(/'(?:[^']|'')*'/g, "''");
  if (!SELECT_ONLY.test(stripped) || FORBIDDEN.test(stripped) || /;\s*\S/.test(stripped)) {
    throw new ReadOnlyViolation();
  }
}

export interface ConmasReader {
  select<R extends Row = Row>(sql: string, params?: readonly unknown[]): Promise<QueryResultLike<R>>;
}

export function createConmasReader(pool: Pick<DbPool, 'query'>): ConmasReader {
  return {
    select<R extends Row = Row>(sql: string, params: readonly unknown[] = []) {
      assertReadOnlySql(sql);
      return pool.query<R>(sql, params);
    },
  };
}

export function createConmasPool(connectionString: string): DbPool {
  return new pg.Pool({
    connectionString,
    max: 5,
    options: '-c default_transaction_read_only=on -c statement_timeout=30000',
  }) as unknown as DbPool;
}
