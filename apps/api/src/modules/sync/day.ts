import { z } from 'zod';
import { isProductionLine } from '../masterData/lineCodes.js';
import { NUMERIC_KEYS, TEXT_KEYS, type DetailRow, type LineDayAggregate, type SlotEventRow } from '../reporting/conmasRepository.js';
import type { Queryable } from '../../db/pool.js';

const line = z.string().max(64).refine(isProductionLine);
const n = z.number();
const number = n.nullable();
const text = z.string().max(4000).nullable();
const identity = { line, date: z.iso.date() };
const totals = z.object({
  ...identity,
  rowCount: n.int().positive(),
  plan: n,
  actual: n,
  rejectM107: n,
  jamTarget: n,
  jamEfektif: n,
  oeeWeighted: n,
  oeeWeight: n,
  oeeAnomaly: n,
  sogo: n,
  shugyo: n,
  kikai: n,
  m4: z.tuple([n, n, n, n, n]),
  availabilityLoss: n,
  performanceLoss: n,
  qualityLoss: n,
});
const detail = z.object({
  line,
  tanggal: z.iso.date(),
  shift: text,
  text: z.record(z.enum(TEXT_KEYS), text),
  num: z.record(z.enum(NUMERIC_KEYS), number),
  products: z.array(z.object({ cl_no: text, product_name: text, mo_no: text, qty: number, swi: number, actual: number })).length(6),
  hourly: z.array(z.object({ plan: number, actual: number })).length(25),
  repTopId: number,
  revNo: number,
});
const event = z.object({
  ...identity,
  shift: text,
  events: z.array(z.object({ kategori: text, masalah: text, minute: number, qty: number, name: text })).max(150),
});
export const dayPayload = z
  .object({ date: z.iso.date(), totals: z.array(totals), details: z.array(detail), events: z.array(event) })
  .refine(
    (d) => d.details.every((r) => r.tanggal === d.date) && [...d.events, ...d.totals].every((r) => r.date === d.date),
    'Tanggal isi snapshot berbeda',
  );
export type DayPayload = z.infer<typeof dayPayload>;

export class SnapshotRepository {
  constructor(
    private readonly db: Queryable,
    private readonly source: string,
  ) {}
  private async entries<K extends 'details' | 'totals' | 'events'>(field: K, start: string, end: string): Promise<DayPayload[K][number][]> {
    const { rows } = await this.db.query<{ items: DayPayload[K] }>(
      `SELECT data->'${field}' AS items FROM push_snapshots WHERE source=$1 AND type BETWEEN $2 AND $3 ORDER BY type`,
      [this.source, 'production-day-' + start, 'production-day-' + end],
    );
    return rows.flatMap((r) => r.items as DayPayload[K][number][]);
  }
  async fetchDetailRows(lines: readonly string[], dates: readonly string[]): Promise<DetailRow[]> {
    if (!lines.length) return [];
    const sorted = [...dates].sort();
    const first = sorted[0],
      last = sorted.at(-1);
    if (!first || !last) return [];
    return (await this.entries('details', first, last)).filter((r) => dates.includes(r.tanggal) && lines.includes(r.line));
  }
  async aggregateByLineDate(lines: readonly string[], start: string, end: string): Promise<LineDayAggregate[]> {
    return (await this.entries('totals', start, end)).filter((r) => lines.includes(r.line));
  }
  async fetchSlotEvents(lines: readonly string[], start: string, end: string): Promise<SlotEventRow[]> {
    return (await this.entries('events', start, end)).filter((r) => lines.includes(r.line));
  }
  async fetchLatestRowPerLine(lines: readonly string[]): Promise<DetailRow[]> {
    if (!lines.length) return [];
    const { rows } = await this.db.query<{ detail: DetailRow }>(
      `SELECT DISTINCT ON (d->>'line') d AS detail FROM push_snapshots p CROSS JOIN LATERAL jsonb_array_elements(p.data->'details') d WHERE p.source=$1 AND p.type LIKE 'production-day-%' AND d->>'line'=ANY($2::text[]) ORDER BY d->>'line',p.type DESC,(d->>'repTopId')::bigint DESC NULLS LAST`,
      [this.source, lines],
    );
    return rows.map((r) => r.detail);
  }
}
