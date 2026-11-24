import type { Request } from 'express';
import type { Queryable } from '../../db/pool.js';

export interface AuditEntry {
  readonly action: string;
  readonly target?: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

/** Catat aksi sensitif (INV-008). Dipanggil di dalam transaksi yang sama dengan perubahannya. */
export async function recordAudit(db: Queryable, req: Pick<Request, 'principal' | 'requestId'>, entry: AuditEntry): Promise<void> {
  const p = req.principal;
  await db.query(`INSERT INTO audit_log (actor_type, actor_id, action, target, detail, request_id) VALUES ($1, $2, $3, $4, $5, $6)`, [
    p ? p.kind : 'anonymous',
    p ? p.id : null,
    entry.action,
    entry.target ?? null,
    JSON.stringify(entry.detail ?? {}),
    req.requestId,
  ]);
}

export async function listAudit(db: Queryable, limit: number, beforeId?: number) {
  const { rows } = beforeId
    ? await db.query(`SELECT * FROM audit_log WHERE id < $1 ORDER BY id DESC LIMIT $2`, [beforeId, limit])
    : await db.query(`SELECT * FROM audit_log ORDER BY id DESC LIMIT $1`, [limit]);
  return rows;
}
