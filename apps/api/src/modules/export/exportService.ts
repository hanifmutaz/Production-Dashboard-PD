import ExcelJS from 'exceljs';

export type ExportFormat = 'xlsx' | 'csv-excel' | 'csv-standard' | 'tsv' | 'json';
export type Cell = string | number | boolean | null;

export interface Table {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly Cell[])[];
}

/** Cegah formula injection saat dibuka di Excel (sel diawali = + - @). */
function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function delimited(table: Table, sep: string): string {
  const esc = (v: Cell): string => {
    if (v === null) return '';
    const s = typeof v === 'string' ? safeText(v) : String(v);
    return s.includes(sep) || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [table.columns.map(esc).join(sep), ...table.rows.map((r) => r.map(esc).join(sep))].join('\r\n');
}

export function selectColumns(table: Table, wanted: readonly string[] | undefined): Table {
  if (!wanted || wanted.length === 0) return table;
  const idx = wanted.map((c) => table.columns.indexOf(c)).filter((i) => i >= 0);
  return { columns: idx.map((i) => table.columns[i] ?? ''), rows: table.rows.map((r) => idx.map((i) => r[i] ?? null)) };
}

export async function renderTable(table: Table, format: ExportFormat, sheetName: string): Promise<{ body: Buffer; contentType: string }> {
  if (format === 'json') {
    const objects = table.rows.map((r) => Object.fromEntries(table.columns.map((c, i) => [c, r[i] ?? null])));
    return { body: Buffer.from(JSON.stringify(objects, null, 2)), contentType: 'application/json; charset=utf-8' };
  }
  // CSV untuk Excel (locale Indonesia): pemisah ";" + BOM. CSV standar: "," tanpa BOM.
  if (format === 'csv-excel') return { body: Buffer.from(`\uFEFF${delimited(table, ';')}`), contentType: 'text/csv; charset=utf-8' };
  if (format === 'csv-standard') return { body: Buffer.from(delimited(table, ',')), contentType: 'text/csv; charset=utf-8' };
  if (format === 'tsv') return { body: Buffer.from(delimited(table, '\t')), contentType: 'text/tab-separated-values; charset=utf-8' };
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.addRow([...table.columns]);
  ws.getRow(1).font = { bold: true };
  for (const r of table.rows) ws.addRow(r.map((v) => (typeof v === 'string' ? safeText(v) : v)));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  return { body: Buffer.from(buf), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}
