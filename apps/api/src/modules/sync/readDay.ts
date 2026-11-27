import type { ConmasReader } from '../../db/conmas.js';
import type { ColumnSql } from '../reporting/columns.js';
import { ConmasRepository } from '../reporting/conmasRepository.js';
import { dayPayload } from './day.js';

export async function readProductionDay(reader: ConmasReader, cols: ColumnSql, date: string) {
  const repo = new ConmasRepository(reader, cols);
  const { rows } = await reader.select<{ line: string }>(
    `SELECT DISTINCT ${cols.lineExpr} AS line FROM ${cols.view} WHERE ${cols.dateExpr}=$1::date AND ${cols.productionModePredicate}`,
    [date],
  );
  const lines = rows.map((r) => r.line);
  const details = await repo.fetchDetailRows(lines, [date]);
  const totals = await repo.aggregateByLineDate(lines, date, date);
  const events = (await repo.fetchSlotEvents(lines, date, date)).map((r) => ({
    ...r,
    events: r.events.filter((e) => Object.values(e).some((v) => v !== null && v !== 0)),
  }));
  return dayPayload.parse({ date, details, totals, events });
}
