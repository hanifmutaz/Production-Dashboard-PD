import type { ShiftScheme } from '@v3/shared';
import type { Queryable } from '../../db/pool.js';

import { isProductionLine } from './lineCodes.js';

export interface LineRecord {
  readonly line_code: string;
  readonly description: string;
  readonly shift_scheme: ShiftScheme;
  readonly location: string;
  readonly active: boolean;
  readonly version: number;
  readonly product: string;
  readonly external_code: string;
  readonly cycle_time: number | null;
}

function mapLine(r: Record<string, unknown>): LineRecord {
  return {
    line_code: String(r['line_code']),
    description: String(r['description'] ?? ''),
    shift_scheme: Number(r['shift_scheme']) === 3 ? 3 : 2,
    location: String(r['location']),
    active: Boolean(r['active']),
    version: Number(r['version']),
    product: String(r['product'] ?? ''),
    external_code: String(r['external_code'] ?? ''),
    cycle_time: r['cycle_time'] === null || r['cycle_time'] === undefined ? null : Number(r['cycle_time']),
  };
}

export class LinesRepository {
  constructor(private readonly db: Queryable) {}

  async listActive(location?: string): Promise<LineRecord[]> {
    const { rows } = location
      ? await this.db.query(`SELECT * FROM lines WHERE active = true AND location = $1 ORDER BY line_code`, [location])
      : await this.db.query(`SELECT * FROM lines WHERE active = true ORDER BY line_code`);
    return rows.map(mapLine).filter((line) => line.location !== 'internal' || isProductionLine(line.line_code));
  }

  async listAll(): Promise<LineRecord[]> {
    const { rows } = await this.db.query(`SELECT * FROM lines ORDER BY line_code`);
    return rows.map(mapLine);
  }

  async find(lineCode: string): Promise<LineRecord | null> {
    const { rows } = await this.db.query(`SELECT * FROM lines WHERE line_code = $1`, [lineCode]);
    const row = rows[0];
    return row && (row['location'] !== 'internal' || isProductionLine(lineCode)) ? mapLine(row) : null;
  }
}
