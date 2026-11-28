// Port exportView/exportBuilder/exPreview mockup. Data & file dibuat di server (/api/v3/export).
import { useEffect, useState } from 'react';
import {
  EXPORT_DATASETS,
  EXPORT_FORMATS,
  EXPORT_TEMPLATES,
  exportDefaultColumns,
  type ExportDatasetKey,
  type ExportFormatKey,
} from '@v3/shared';
import { PageLead } from '../components/common';
import { RangePicker, rangeLabel } from '../components/Picker';
import { api, ApiError, downloadFile } from '../lib/api';
import { useConfig } from '../lib/kpi';
import { useAuth } from '../lib/auth';
import { presetRange, type Range } from '../lib/dates';
import { fmt, MON } from '../lib/format';
import { Icon } from '../lib/icons';
import { visibleSites, siteName } from '../lib/sites';
import { useApi } from '../lib/useApi';

interface SavedTemplate {
  readonly id: number;
  readonly name: string;
  readonly version: number;
  readonly definition: { source?: ExportDatasetKey; columns?: string[]; agg?: 'day' | 'tot'; format?: ExportFormatKey };
}
interface Preview {
  readonly columns: string[];
  readonly rows: (string | number | boolean | null)[][];
  readonly total: number;
}

type Cols = readonly (readonly [string, string, boolean, boolean?])[];
const colsOf = (ds: ExportDatasetKey): Cols => EXPORT_DATASETS[ds].cols as unknown as Cols;
const monthLabel = (p: string): string => `${MON[Number(p.slice(5)) - 1] ?? ''} ${p.slice(0, 4)}`;

export function Export() {
  const { sites: status } = useConfig();
  const { me } = useAuth();
  const visible = visibleSites(me);
  const multi = visible.length > 1;
  const today = me?.today ?? '';
  const [ds, setDs] = useState<ExportDatasetKey>('line_day');
  const [template, setTemplate] = useState('daily');
  const [custom, setCustom] = useState(false);
  const [rng, setRng] = useState<Range>(() => presetRange('yday', today));
  const [period, setPeriod] = useState(today.slice(0, 7));
  const [locs, setLocs] = useState<Record<string, boolean>>({ internal: true, sgp: true, systech: true });
  const [lines, setLines] = useState('');
  const [shift, setShift] = useState<'all' | '1' | '2' | '3'>('all');
  const [agg, setAgg] = useState<'day' | 'tot'>('day');
  const [format, setFormat] = useState<ExportFormatKey>('csv-excel');
  const [name, setName] = useState('');
  const [columns, setColumns] = useState<string[]>(exportDefaultColumns('line_day'));
  const [limit, setLimit] = useState(8);
  const [tplName, setTplName] = useState('');
  const [tplMsg, setTplMsg] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [warning, setWarning] = useState('');
  const [busy, setBusy] = useState(false);
  const saved = useApi<SavedTemplate[]>('/api/v3/export/templates');

  const D = EXPORT_DATASETS[ds];
  const sites = visible.filter((k) => (!multi || locs[k]) && status[k] === 'ok');
  const isExec = ds === 'exec';
  const hasLine = !['exec', 'loc_day'].includes(ds);
  const hasShift = ['line_hour', 'line_shift', 'line_product', 'stop', 'rej'].includes(ds);
  const body = {
    ds,
    format,
    start: isExec ? `${period}-01` : rng.f,
    end: isExec ? `${period}-01` : rng.t,
    ...(isExec ? { period } : {}),
    locations: sites,
    lines,
    shift,
    agg,
    columns,
    name,
  };
  const bodyKey = JSON.stringify({ ...body, format: '', name: '' });

  useEffect(() => {
    setWarning('');
    if (!sites.length) {
      setPreview(null);
      setWarning('Pilih minimal satu lokasi.');
      return;
    }
    if (!columns.length) {
      setPreview(null);
      setWarning('Pilih minimal satu kolom.');
      return;
    }
    let live = true;
    api
      .post<Preview>(`/api/v3/export/preview?limit=${limit}`, body)
      .then((r) => live && setPreview(r.data))
      .catch((e: unknown) => live && (setPreview(null), setWarning(e instanceof ApiError ? e.message : 'Pratinjau gagal dimuat.')));
    return () => {
      live = false;
    };
  }, [bodyKey, limit]);

  const selectTemplate = (id: string): void => {
    setTplMsg('');
    setLimit(8);
    if (!id) {
      setTemplate('');
      setCustom(true);
      setTplName('');
      return;
    }
    const builtin = EXPORT_TEMPLATES.find((t) => t.id === id);
    if (builtin) {
      setTemplate(id);
      setCustom(false);
      setDs(builtin.source);
      setAgg(builtin.agg === 'tot' ? 'tot' : 'day');
      setShift('all');
      setColumns(exportDefaultColumns(builtin.source));
      setLocs({ internal: true, sgp: true, systech: true });
      setLines('');
      if (builtin.period) setRng(presetRange(builtin.period, today));
      if (builtin.source === 'exec') setPeriod(today.slice(0, 7));
      setTplName('');
      return;
    }
    const s = saved.data?.find((t) => `saved-${t.id}` === id);
    if (!s) return;
    const src = s.definition.source && s.definition.source in EXPORT_DATASETS ? s.definition.source : 'line_day';
    const valid = colsOf(src).map((c) => c[0]);
    setTemplate(id);
    setCustom(true);
    setDs(src);
    setColumns([...new Set((s.definition.columns ?? []).filter((k) => valid.includes(k)))]);
    setAgg(s.definition.agg === 'tot' ? 'tot' : 'day');
    if (s.definition.format && EXPORT_FORMATS.some(([f]) => f === s.definition.format)) setFormat(s.definition.format);
    setTplName(s.name);
  };

  const saveTemplate = async (): Promise<void> => {
    const n = tplName.trim();
    if (!n || n.length > 60) return setTplMsg('Isi nama template hingga 60 karakter.');
    if (!columns.length) return setTplMsg('Pilih minimal satu kolom sebelum menyimpan.');
    const definition = { source: ds, columns, agg, format };
    const current = saved.data?.find((t) => `saved-${t.id}` === template);
    try {
      if (current && current.name.toLowerCase() === n.toLowerCase()) {
        await api.put(`/api/v3/export/templates/${current.id}`, { definition, version: current.version });
      } else {
        const r = await api.post<{ id: number }>('/api/v3/export/templates', { name: n, definition });
        if (r.data) setTemplate(`saved-${r.data.id}`);
      }
      setTplMsg('Template tersimpan di akun Anda.');
      saved.reload();
    } catch (e) {
      setTplMsg(e instanceof ApiError ? e.message : 'Template gagal disimpan.');
    }
  };

  const download = async (): Promise<void> => {
    setBusy(true);
    setWarning('');
    try {
      const { blob, filename } = await downloadFile('/api/v3/export', body);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setWarning(e instanceof ApiError ? e.message : 'Unduhan gagal.');
    } finally {
      setBusy(false);
    }
  };

  const ordered = columns.map((k) => colsOf(ds).find((c) => c[0] === k)).filter((c): c is Cols[number] => c !== undefined);
  const unavailable = colsOf(ds)
    .filter((c) => c[3] && columns.includes(c[0]))
    .map((c) => c[1]);
  const move = (key: string, dir: number): void => {
    const i = columns.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= columns.length) return;
    const next = [...columns];
    [next[i], next[j]] = [next[j] ?? '', next[i] ?? ''];
    setColumns(next);
  };
  const formatLabel = EXPORT_FORMATS.find(([k]) => k === format)?.[1] ?? '';
  const ext = format === 'xlsx' ? 'xlsx' : format === 'json' ? 'json' : format === 'tsv' ? 'tsv' : 'csv';
  const fileName = `${(name || `${ds}_${isExec ? period : `${rng.f}_${rng.t}`}`).replace(/\s+/g, '_')}.${ext}`;
  const downloadType = format === 'xlsx' ? 'Excel' : format === 'json' ? 'JSON' : format === 'tsv' ? 'TSV' : 'CSV';
  const current = saved.data?.find((t) => `saved-${t.id}` === template);
  const editing = current && current.name.toLowerCase() === tplName.trim().toLowerCase();

  return (
    <div className="page">
      <div className="export-page">
        <PageLead note="Data i-Reporter · file dibuat di server" />
        <div className="xg">
          <div className="xl">
            <section className="card export-presets">
              <h2>Template laporan</h2>
              <div className="export-template-controls">
                <label className="fld">
                  Template
                  <select id="x-template" value={template} onChange={(e) => selectTemplate(e.target.value)}>
                    <optgroup label="Bawaan">
                      {EXPORT_TEMPLATES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </optgroup>
                    {saved.data?.length ? (
                      <optgroup label="Tersimpan">
                        {saved.data.map((t) => (
                          <option key={t.id} value={`saved-${t.id}`}>
                            {t.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    <option value="">Custom</option>
                  </select>
                </label>
                {custom ? (
                  <label className="fld">
                    Jenis data
                    <select
                      id="x-source"
                      value={ds}
                      onChange={(e) => {
                        const next = e.target.value as ExportDatasetKey;
                        setDs(next);
                        setColumns(exportDefaultColumns(next));
                      }}
                    >
                      {Object.entries(EXPORT_DATASETS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.t}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            </section>
            <section className="card export-filters">
              <h2>Filter laporan</h2>
              {multi && (<div className="chips" aria-label="Pilihan lokasi">
                {visible.map((k) => (
                  <button
                    key={k}
                    className="chip b"
                    type="button"
                    data-xloc={k}
                    aria-pressed={Boolean(locs[k])}
                    onClick={() => setLocs({ ...locs, [k]: !locs[k] })}
                  >
                    {siteName(k)}
                    {status[k] === 'on_hold' ? ' · On Hold' : status[k] === 'unavailable' ? ' · Menunggu sinkronisasi' : ''}
                  </button>
                ))}
              </div>)}
              <div className="rowf">
                {isExec ? (
                  <label className="export-month">
                    Bulan laporan
                    <input
                      type="month"
                      id="x-exec-period"
                      min="2024-01"
                      max={today.slice(0, 7)}
                      value={period}
                      onChange={(e) => e.target.value && setPeriod(e.target.value)}
                    />
                  </label>
                ) : (
                  <div className="fld">
                    <span>Periode</span>
                    <RangePicker value={rng} today={today} onChange={setRng} wide />
                  </div>
                )}
                {'agg' in D ? (
                  <label className="fld">
                    Rincian
                    <select id="x-aggregation" value={agg} onChange={(e) => setAgg(e.target.value === 'tot' ? 'tot' : 'day')}>
                      <option value="day">Per hari</option>
                      <option value="tot">Total periode</option>
                    </select>
                  </label>
                ) : null}
              </div>
              {hasLine ? (
                <div className="rowf">
                  <label className="fld export-line-filter">
                    Filter line (opsional)
                    <input
                      type="text"
                      id="x-lines"
                      value={lines}
                      maxLength={200}
                      placeholder="Mis. 41HR101, 41HR12"
                      onChange={(e) => setLines(e.target.value)}
                    />
                  </label>
                  {hasShift ? (
                    <label className="fld">
                      Shift
                      <select id="x-shift" value={shift} onChange={(e) => setShift(e.target.value as typeof shift)}>
                        <option value="all">Semua shift</option>
                        {['1', '2', '3'].map((n) => (
                          <option key={n} value={n}>
                            Shift {n}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              ) : null}
            </section>
            <section className="card" id="x-builder">
              <div className="export-section-head">
                <h2>Kolom laporan</h2>
                {custom ? null : (
                  <button className="btn" type="button" data-x-custom onClick={() => (setCustom(true), setTemplate(''))}>
                    <Icon name="settings" size={15} /> Atur kolom
                  </button>
                )}
              </div>
              {custom ? (
                <>
                  <div className="export-column-layout">
                    <div>
                      <h3>Pilih kolom</h3>
                      <div className="export-column-actions">
                        <button className="btn" type="button" onClick={() => setColumns(colsOf(ds).map((c) => c[0]))}>
                          Pilih semua
                        </button>
                        <button className="btn" type="button" onClick={() => setColumns([])}>
                          Kosongkan
                        </button>
                        <button className="btn" type="button" onClick={() => setColumns(exportDefaultColumns(ds))}>
                          Default
                        </button>
                      </div>
                      <div className="export-column-choice-list">
                        {colsOf(ds).map(([key, title, , missing]) => (
                          <label className="export-column-choice" key={key}>
                            <input
                              type="checkbox"
                              data-xcol={key}
                              checked={columns.includes(key)}
                              onChange={(e) => setColumns(e.target.checked ? [...columns, key] : columns.filter((k) => k !== key))}
                            />
                            <span>
                              {title}
                              {missing ? <small>Belum tersedia</small> : null}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3>
                        Urutan kolom <small>{ordered.length}</small>
                      </h3>
                      {ordered.length ? (
                        <ol className="export-column-order">
                          {ordered.map(([key, title], i) => (
                            <li key={key}>
                              <span>{title}</span>
                              <div>
                                <button
                                  className="ib"
                                  type="button"
                                  aria-label={`Naikkan ${title}`}
                                  disabled={i === 0}
                                  onClick={() => move(key, -1)}
                                >
                                  <Icon name="up" size={15} />
                                </button>
                                <button
                                  className="ib"
                                  type="button"
                                  aria-label={`Turunkan ${title}`}
                                  disabled={i === ordered.length - 1}
                                  onClick={() => move(key, 1)}
                                >
                                  <Icon name="down" size={15} />
                                </button>
                              </div>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="sb">Pilih kolom untuk menentukan urutan.</p>
                      )}
                    </div>
                  </div>
                  <div className="export-save-template">
                    <label className="fld">
                      Nama template
                      <input
                        type="text"
                        id="x-template-name"
                        maxLength={60}
                        value={tplName}
                        placeholder="Mis. Stoptime meeting"
                        onChange={(e) => setTplName(e.target.value)}
                      />
                    </label>
                    <button className="btn" type="button" data-x-save onClick={() => void saveTemplate()}>
                      {editing ? 'Perbarui template' : 'Simpan template'}
                    </button>
                  </div>
                  <p className="sb export-save-note">
                    Template menyimpan jenis data, susunan kolom, dan format untuk dipakai ulang (per akun).
                  </p>
                </>
              ) : (
                <p className="export-column-summary">
                  {ordered.length ? ordered.map((c) => c[1]).join(' · ') : 'Belum ada kolom dipilih.'}
                </p>
              )}
              {unavailable.length ? (
                <p className="export-missing" role="note">
                  {unavailable.join(', ')} belum tersedia untuk data ini. Sel pada hasil unduhan dikosongkan.
                </p>
              ) : null}
              <p className="export-template-message" role="status" hidden={!tplMsg}>
                {tplMsg}
              </p>
            </section>
            <section className="card">
              <h2>Format file</h2>
              <div className="rowf export-file-controls">
                <label className="fld">
                  Format
                  <select id="x-format" value={format} onChange={(e) => setFormat(e.target.value as ExportFormatKey)}>
                    {EXPORT_FORMATS.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="fld export-line-filter">
                  Nama file (opsional)
                  <input
                    type="text"
                    id="x-name"
                    value={name}
                    maxLength={100}
                    placeholder="Otomatis"
                    onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9 ._-]/g, ''))}
                  />
                </label>
              </div>
            </section>
          </div>
          <div className="xr export-preview">
            <div className="card" id="xpv">
              <div className="stp">
                <h2>Ringkasan &amp; Pratinjau</h2>
              </div>
              {warning ? (
                <div className="warn" role="status">
                  {warning}
                </div>
              ) : null}
              <dl className="sumv">
                <dt>Data</dt>
                <dd>
                  {D.t}
                  {'agg' in D ? ` · ${agg === 'tot' ? 'total periode' : 'per hari'}` : ''}
                </dd>
                <dt>Lokasi</dt>
                <dd>{sites.map(siteName).join(', ') || '—'}</dd>
                <dt>Periode</dt>
                <dd>{isExec ? monthLabel(period) : rangeLabel(rng)}</dd>
                <dt>Format</dt>
                <dd>{formatLabel}</dd>
                <dt>Baris</dt>
                <dd>{preview ? fmt(preview.total) : '—'}</dd>
                <dt>Kolom</dt>
                <dd>
                  {columns.length} dari {D.cols.length}
                </dd>
                <dt>File</dt>
                <dd>{fileName}</dd>
              </dl>
              {preview && preview.rows.length ? (
                <>
                  <div className="pvt" role="region" aria-label="Baris pratinjau" tabIndex={0}>
                    <table>
                      <thead>
                        <tr>
                          {preview.columns.map((c) => (
                            <th scope="col" key={c}>
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((r, i) => (
                          <tr key={i}>
                            {r.map((v, j) => (
                              <td key={j}>{v === null ? '—' : String(v)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="sb">
                    Menampilkan {fmt(preview.rows.length)} dari {fmt(preview.total)} baris
                  </p>
                </>
              ) : null}
              <div className="export-actions">
                {preview && preview.total > 8 ? (
                  <button className="btn" type="button" data-xpreview onClick={() => setLimit(limit > 8 ? 8 : 40)}>
                    {limit > 8 ? 'Tampilkan 8 baris' : 'Tampilkan hingga 40 baris'}
                  </button>
                ) : null}
                <button className="btn pri" type="button" data-xdl="1" disabled={!preview?.total || busy} onClick={() => void download()}>
                  <Icon name="dl" size={16} />
                  {busy ? ' Menyiapkan file…' : ` Unduh ${downloadType}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
