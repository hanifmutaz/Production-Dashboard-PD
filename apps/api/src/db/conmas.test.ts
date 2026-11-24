import { describe, expect, it } from 'vitest';
import { assertReadOnlySql, createConmasReader, ReadOnlyViolation } from './conmas.js';

describe('INV-001 guard read-only ConMas', () => {
  it.each([
    'SELECT 1',
    'WITH x AS (SELECT 1) SELECT * FROM x',
    "SELECT * FROM v WHERE note = 'Delete burr'",
    'select offset_col from v order by 1 desc',
  ])('lolos: %s', (sql) => {
    expect(() => assertReadOnlySql(sql)).not.toThrow();
  });

  it.each([
    'INSERT INTO v VALUES (1)',
    'UPDATE v SET a = 1',
    'DELETE FROM v',
    'SELECT 1; DROP TABLE v',
    'WITH d AS (DELETE FROM v RETURNING *) SELECT * FROM d',
    'CREATE TABLE x (a int)',
    'SET default_transaction_read_only = off',
    'TRUNCATE v',
  ])('ditolak: %s', (sql) => {
    expect(() => assertReadOnlySql(sql)).toThrow(ReadOnlyViolation);
  });

  it('reader menolak sebelum query dikirim ke DB', async () => {
    let called = false;
    const reader = createConmasReader({
      query: async () => {
        called = true;
        return { rows: [], rowCount: 0 };
      },
    });
    expect(() => reader.select('DELETE FROM v')).toThrow(ReadOnlyViolation);
    expect(called).toBe(false);
  });
});
