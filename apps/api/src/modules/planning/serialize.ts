// Normalisasi baris target agar API selalu mengirim number (kolom NUMERIC bisa datang sebagai string dari pg).
import type { Row } from '../../db/pool.js';

export function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error(`Nilai numerik tidak valid: ${String(value)}`);
  return n;
}

export function serializeTargetRow<R extends Row>(row: R): Omit<R, 'target'> & { target: number } {
  return { ...row, target: toNumber(row['target']) };
}
