// Panel Settings yang memakai API asli (bukan penyimpanan settings generik).
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dayList, lastOfMonth } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Icon } from '../../lib/icons';
import { useConfig } from '../../lib/kpi';
import { siteName, SITES } from '../../lib/sites';
import { useApi, type ApiState } from '../../lib/useApi';
import { Editor, ListTable, type Lookups } from './Fields';
import { MENU_OPTIONS, SPEC, type Field } from './spec';
import { useSaveSetting } from './Settings';

/** Salinan objek tanpa satu key (pengganti `delete obj[key]` yang dilarang lint). */
function omitKey<T>(obj: Readonly<Record<string, T>>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));
}

const errText = (e: unknown, fallback = 'Gagal menyimpan.'): string =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : fallback;

function Feedback({ msg, error }: { readonly msg: string; readonly error?: boolean }) {
  return msg ? (
    <p id="settings-feedback" className="settings-feedback" role={error ? 'alert' : 'status'} {...(error ? { 'data-error': '' } : {})}>
      {msg}
    </p>
  ) : null;
}

// ---------- Line ----------
interface LineRec {
  readonly line_code: string;
  readonly description: string;
  readonly shift_scheme: number;
  readonly location: string;
  readonly active: boolean;
  readonly version: number;
  readonly product: string;
  readonly external_code: string;
  readonly cycle_time: number | null;
}

export function LinesPanel({ lookups, onChange }: { readonly lookups: Lookups; readonly onChange: () => void }) {
  const lines = useApi<LineRec[]>('/api/v3/lines/all');
  const canEdit = useAuth().can('config.edit');
  const disc = useApi<string[]>(canEdit ? '/api/v3/lines/discover' : null);
  const eff = useApi<{ line_discovery: { shift_scheme: number; location: string } }>('/api/v3/settings/effective');
  const save = useSaveSetting();
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<[string, boolean]>(['', false]);
  const rec = editing === 'new' ? null : lines.data?.find((l) => l.line_code === editing);
  const put = async (code: string, v: Record<string, unknown>, version?: number): Promise<void> => {
    await api.put(`/api/v3/lines/${encodeURIComponent(code)}`, {
      description: String(v['name'] ?? ''),
      shift_scheme: Number(v['scheme'] ?? 2),
      tempat: String(v['site'] ?? 'internal'),
      active: v['active'] !== false,
      product: String(v['product'] ?? ''),
      external_code: String(v['external'] ?? ''),
      cycle_time: v['cycle'] === '' || v['cycle'] === undefined ? null : Number(v['cycle']),
      ...(version ? { version } : {}),
    });
  };
  const reload = (): void => {
    lines.reload();
    disc.reload();
    onChange();
  };
  const fields = (SPEC['lines'] ?? []).map((f) =>
    f[0] === 'code' && editing !== 'new' ? ([f[0], `${f[1]} (tidak bisa diubah)`, 'text', true] as Field) : f,
  );
  return (
    <>
      <Feedback msg={msg[0]} error={msg[1]} />
      {editing ? (
        <Editor
          section="lines"
          label="Line"
          isList
          fields={fields}
          lookups={lookups}
          record={
            rec
              ? {
                  id: rec.line_code,
                  site: rec.location,
                  code: rec.line_code,
                  name: rec.description,
                  product: rec.product,
                  external: rec.external_code,
                  cycle: rec.cycle_time ?? '',
                  scheme: String(rec.shift_scheme),
                }
              : { site: 'internal', scheme: '2' }
          }
          onCancel={() => setEditing(null)}
          onSave={async (v) => {
            const code = rec ? rec.line_code : String(v['code'] ?? '').toUpperCase();
            if (!/^[A-Za-z0-9_-]{1,40}$/.test(code)) throw new Error('Kode line hanya huruf, angka, _ dan -.');
            try {
              await put(code, { ...v, active: rec ? rec.active : true }, rec?.version);
            } catch (e) {
              throw new Error(errText(e), { cause: e });
            }
            setMsg(['Line disimpan.', false]);
            setEditing(null);
            reload();
          }}
        />
      ) : null}
      <ListTable
        label="Line"
        readOnly={!canEdit}
        rows={(lines.data ?? []).map((l) => ({
          id: l.line_code,
          active: l.active,
          title: l.description && l.description !== l.line_code ? `${l.line_code} · ${l.description}` : l.line_code,
          detail: [siteName(l.location), l.product, `${l.shift_scheme} shift`, l.cycle_time ? `${l.cycle_time} s` : null],
        }))}
        onNew={() => setEditing('new')}
        onEdit={setEditing}
        onToggle={(id) => {
          const l = lines.data?.find((x) => x.line_code === id);
          if (!l) return;
          put(
            id,
            {
              name: l.description,
              scheme: l.shift_scheme,
              site: l.location,
              product: l.product,
              external: l.external_code,
              cycle: l.cycle_time ?? '',
              active: !l.active,
            },
            l.version,
          )
            .then(() => (setMsg([`Line ${id} ${l.active ? 'dinonaktifkan' : 'diaktifkan'}.`, false]), reload()))
            .catch((e: unknown) => setMsg([errText(e), true]));
        }}
      />
      {canEdit && (
        <section className="settings-card">
          <header>
            <div>
              <h3>Line baru dari i-Reporter</h3>
              <p>{disc.data ? `${disc.data.length} line ditemukan di ConMas yang belum terdaftar` : 'Memeriksa…'}</p>
            </div>
            <button
              className="btn pri"
              type="button"
              disabled={!disc.data?.length}
              onClick={() =>
                api
                  .post<{ added: string[] }>('/api/v3/lines/sync')
                  .then((r) => (setMsg([`${r.data?.added.length ?? 0} line didaftarkan.`, false]), reload()))
                  .catch((e: unknown) => setMsg([errText(e), true]))
              }
            >
              Daftarkan semua
            </button>
          </header>
          {disc.data?.length ? <p className="settings-help">{disc.data.join(', ')}</p> : null}
          {eff.data ? (
            <form
              className="settings-fields"
              key={JSON.stringify(eff.data.line_discovery)}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                save('line_discovery', { shift_scheme: Number(f.get('scheme')), location: String(f.get('location')) })
                  .then(() => (setMsg(['Default line baru disimpan.', false]), eff.reload()))
                  .catch((err: unknown) => setMsg([errText(err), true]));
              }}
            >
              <div className="setting-field">
                <label htmlFor="ld-scheme">Default skema shift line baru</label>
                <select id="ld-scheme" name="scheme" defaultValue={String(eff.data.line_discovery.shift_scheme)}>
                  <option value="2">2 shift</option>
                  <option value="3">3 shift</option>
                </select>
              </div>
              <div className="setting-field">
                <label htmlFor="ld-loc">Default lokasi line baru</label>
                <select id="ld-loc" name="location" defaultValue={eff.data.line_discovery.location}>
                  {SITES.map((s) => (
                    <option key={s} value={s}>
                      {siteName(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="settings-save">
                <button className="btn" type="submit">
                  Simpan default
                </button>
              </div>
            </form>
          ) : null}
        </section>
      )}
    </>
  );
}

// ---------- Target Produksi ----------
interface Plan {
  readonly locations: readonly { location: string; target: number; version: number }[];
  readonly lines: readonly { line_code: string; target: number; work_days: number; note: string; version: number }[];
}

type MasterLines = ApiState<Pick<LineRec, 'line_code' | 'product' | 'location'>[]>;
type TargetDraft = { qty: string; days: string; note: string; version?: number };
type PlanningProps = { readonly master: MasterLines };

export function PlanningPanel({ master }: PlanningProps) {
  const { me } = useAuth();
  const [period, setPeriod] = useState((me?.today ?? '').slice(0, 7));
  return <MonthTargets key={period} master={master} period={period} changePeriod={setPeriod} />;
}

function MonthTargets({
  master,
  period,
  changePeriod,
}: PlanningProps & {
  readonly period: string;
  readonly changePeriod: (month: string) => void;
}) {
  const canEdit = useAuth().can('config.edit');
  const [year, month] = period.split('-').map(Number);
  const query = `year=${year}&month=${month}`;
  const plan = useApi<Plan>(`/api/v3/planning?${query}`);
  const calendar = useApi<{ holidays: string[] }>(`/api/v3/executive/calendar?tempat=internal&${query}`);
  const [drafts, setDrafts] = useState<Record<string, TargetDraft>>({});
  const [search, setSearch] = useState('');
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<[string, boolean]>(['', false]);
  const holidays = new Set(calendar.data?.holidays);
  const workDays = calendar.data ? dayList(`${period}-01`, lastOfMonth(period)).filter((d) => !holidays.has(d)).length : null;
  const saved = new Map<string, TargetDraft>();
  for (const t of plan.data?.lines ?? []) {
    saved.set('line:' + t.line_code, { qty: String(t.target), days: String(t.work_days), note: t.note, version: t.version });
  }
  for (const t of plan.data?.locations ?? []) {
    saved.set('loc:' + t.location, { qty: String(t.target), days: '', note: '', version: t.version });
  }
  const baseline = (id: string): TargetDraft =>
    saved.get(id) ?? {
      qty: '',
      days: id.startsWith('line:') && workDays !== null ? String(workDays) : '',
      note: '',
    };
  const value = (id: string) => drafts[id] ?? baseline(id);
  const edit = (id: string, changes: Partial<TargetDraft>) => {
    const original = baseline(id);
    const next = { ...value(id), ...changes };
    setDrafts((old) =>
      next.qty === original.qty && next.days === original.days && next.note === original.note ? omitKey(old, id) : { ...old, [id]: next },
    );
  };
  const pending = Object.entries(drafts);
  const ready = Boolean(plan.data && master.data && calendar.data) && !plan.loading && !master.loading && !calendar.loading;
  const save = async () => {
    if (busy || !ready || !pending.length) return;
    for (const [id, d] of pending) {
      const label = id.slice(id.indexOf(':') + 1);
      if (!/^\d+$/.test(d.qty) || Number(d.qty) > 1_000_000_000) {
        setMessage([`Isi target ${label} dengan angka bulat 0–1.000.000.000 pcs.`, true]);
        return;
      }
      if (id.startsWith('line:') && (!/^\d+$/.test(d.days) || Number(d.days) < 1 || Number(d.days) > 31)) {
        setMessage([`Isi hari kerja ${label} antara 1 dan 31.`, true]);
        return;
      }
      if (d.version !== saved.get(id)?.version) {
        setMessage([`Target ${label} berubah. Batalkan isian baris itu untuk melihat nilai terbaru sebelum mengedit lagi.`, true]);
        return;
      }
    }
    setBusy(true);
    let completed = 0;
    let current = '';
    try {
      for (const [id, d] of pending) {
        current = id.slice(id.indexOf(':') + 1);
        const body = { year, month, target: Number(d.qty), version: d.version };
        if (id.startsWith('loc:')) {
          await api.put('/api/v3/executive/target', { ...body, tempat: current });
        } else {
          await api.put('/api/v3/planning/line', { ...body, line_code: current, work_days: Number(d.days), note: d.note });
        }
        completed += 1;
        setDrafts((old) => omitKey(old, id));
      }
      setMessage([`${completed} target disimpan.`, false]);
    } catch (e) {
      setMessage([`${completed} target disimpan. ${current}: ${errText(e)}`, true]);
    } finally {
      plan.reload();
      setBusy(false);
    }
  };
  const undo = (id: string) =>
    drafts[id] ? (
      <button
        className="btn"
        type="button"
        disabled={busy}
        aria-label={`Batalkan isian ${id.slice(id.indexOf(':') + 1)}`}
        onClick={() => setDrafts((old) => omitKey(old, id))}
      >
        Batal
      </button>
    ) : null;
  const input = (id: string, label: string, field: 'qty' | 'days') =>
    !canEdit ? (
      value(id)[field] || '—'
    ) : (
      <input
        type="number"
        aria-label={label}
        min={field === 'days' ? 1 : 0}
        max={field === 'days' ? 31 : 1000000000}
        style={{ width: field === 'days' ? '5rem' : '10rem' }}
        placeholder={field === 'qty' ? 'Belum ada target' : 'Hari'}
        step="1"
        disabled={!ready || busy}
        value={value(id)[field]}
        onChange={(e) => edit(id, { [field]: e.target.value })}
      />
    );
  const lines = new Map((master.data ?? []).filter((l) => l.location === 'internal').map((l) => [l.line_code, l.product]));
  // Keep previously planned lines accessible if the master record was removed.
  const known = new Set((master.data ?? []).map((l) => l.line_code));
  for (const l of plan.data?.lines ?? []) if (!known.has(l.line_code)) lines.set(l.line_code, '');
  const needle = search.trim().toLowerCase();
  const visible = [...lines].filter(
    ([code, product]) => `${code} ${product}`.toLowerCase().includes(needle) && (!missing || !saved.has('line:' + code)),
  );
  const error = master.error || plan.error || calendar.error;
  return (
    <>
      <section className="settings-card settings-list">
        <header>
          <h3>Target lokasi</h3>
          <input
            type="month"
            aria-label="Bulan target"
            value={period}
            min="2024-01"
            max="2099-12"
            disabled={busy}
            onChange={(e) => {
              if (e.target.value && (!pending.length || window.confirm('Buang perubahan bulan ini?'))) changePeriod(e.target.value);
            }}
          />
        </header>
        <div className="settings-table">
          <table>
            <thead>
              <tr>
                <th>Lokasi</th>
                <th>Target bulanan (pcs)</th>
                {canEdit && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {SITES.map((site) => (
                <tr key={site}>
                  <th scope="row">{siteName(site)}</th>
                  <td>
                    {site === 'internal' || saved.has('loc:' + site) ? input('loc:' + site, `Target ${siteName(site)}`, 'qty') : 'On Hold'}
                  </td>
                  {canEdit && <td>{undo('loc:' + site)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="settings-card settings-list">
        <header>
          <h3>Target per line · Hirose Internal</h3>
          {canEdit && (
            <button type="button" className="btn" disabled={!ready || busy || !pending.length} onClick={() => void save()}>
              {busy ? 'Menyimpan…' : `Simpan perubahan${pending.length ? ` (${pending.length})` : ''}`}
            </button>
          )}
        </header>
        <Feedback msg={error || message[0]} error={Boolean(error) || message[1]} />
        <div className="settings-tabs">
          <input
            type="search"
            aria-label="Cari line atau series"
            placeholder="Cari line atau series"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label>
            <input type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} /> Belum ada target
          </label>
        </div>
        <div className="settings-table target-line-scroll" style={{ overflow: 'auto', maxHeight: '60vh' }}>
          <table>
            <thead>
              <tr>
                <th>Line</th>
                <th>Series</th>
                <th>Target bulanan (pcs)</th>
                <th>Hari kerja</th>
                <th>Target/hari (pcs)</th>
                <th>Catatan</th>
                {canEdit && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map(([code, product]) => {
                const id = 'line:' + code;
                const d = value(id);
                return (
                  <tr key={code}>
                    <th scope="row">{code}</th>
                    <td>{product || '—'}</td>
                    <td>{input(id, `Target bulanan ${code}`, 'qty')}</td>
                    <td>{input(id, `Hari kerja ${code}`, 'days')}</td>
                    <td>{d.qty !== '' && Number(d.days) > 0 ? fmt(Number(d.qty) / Number(d.days)) : '—'}</td>
                    <td>
                      {canEdit ? (
                        <input
                          aria-label={`Catatan ${code}`}
                          maxLength={130}
                          value={d.note}
                          disabled={!ready || busy}
                          onChange={(e) => edit(id, { note: e.target.value })}
                        />
                      ) : (
                        d.note || '—'
                      )}
                    </td>
                    {canEdit && <td>{undo(id)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!visible.length && !error ? <p>{ready ? 'Tidak ada line yang cocok.' : 'Memuat target…'}</p> : null}
      </section>
    </>
  );
}

// ---------- Akun ----------
interface UserRec {
  readonly id: number;
  readonly email: string | null;
  readonly display_name: string;
  readonly role: string;
  readonly active: boolean;
  readonly version: number;
  readonly locations: string[] | string;
}
interface RoleRec {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly is_builtin: boolean;
  readonly version: number;
  readonly permissions: string[];
  readonly menus: string[];
}

const locList = (v: string[] | string): string[] => (Array.isArray(v) ? v : String(v).replace(/[{}"]/g, '').split(',').filter(Boolean));

export function UsersPanel() {
  const users = useApi<UserRec[]>('/api/v3/access/users');
  const roles = useApi<RoleRec[]>('/api/v3/access/roles');
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<[string, boolean]>(['', false]);
  const rec = users.data?.find((u) => String(u.id) === editing);
  const roleOpts = (roles.data ?? []).map((r) => [r.code, r.name] as const);
  const fields = (SPEC['users'] ?? []).map((f) =>
    f[0] === 'password'
      ? ([f[0], rec ? 'Password baru (kosongkan bila tetap)' : 'Password (min. 10 karakter)', 'password', Boolean(rec)] as Field)
      : f,
  );
  return (
    <>
      <Feedback msg={msg[0]} error={msg[1]} />
      {editing ? (
        <Editor
          section="users"
          label="Akun"
          isList
          fields={fields}
          lookups={{ lines: [], products: [], roles: roleOpts }}
          record={
            rec
              ? { id: rec.id, email: rec.email ?? '', name: rec.display_name, role: rec.role, site: locList(rec.locations)[0] ?? '' }
              : { role: 'viewer' }
          }
          onCancel={() => setEditing(null)}
          onSave={async (v) => {
            const pw = String(v['password'] ?? '');
            if (!rec && pw.length < 10) throw new Error('Password minimal 10 karakter.');
            if (rec && pw && pw.length < 10) throw new Error('Password minimal 10 karakter.');
            const locations = v['site'] ? [String(v['site'])] : [];
            try {
              if (rec) {
                await api.patch(`/api/v3/access/users/${rec.id}`, {
                  ...(rec.email !== v['email'] ? { email: v['email'] } : {}),
                  display_name: v['name'],
                  role: v['role'],
                  locations,
                  ...(pw ? { password: pw } : {}),
                  version: rec.version,
                });
              } else {
                await api.post('/api/v3/access/users', {
                  email: String(v['email'] ?? ''),
                  display_name: v['name'],
                  password: pw,
                  role: v['role'],
                  locations,
                });
              }
            } catch (e) {
              throw new Error(errText(e), { cause: e });
            }
            setMsg(['Akun disimpan.', false]);
            setEditing(null);
            users.reload();
          }}
        />
      ) : null}
      <ListTable
        label="Akun"
        rows={(users.data ?? []).map((u) => ({
          id: String(u.id),
          active: u.active,
          title: u.display_name,
          detail: [
            u.email ?? 'Email belum diisi',
            roles.data?.find((r) => r.code === u.role)?.name ?? u.role,
            locList(u.locations).map(siteName).join(', ') || 'Semua lokasi',
          ],
        }))}
        onNew={() => setEditing('new')}
        onEdit={setEditing}
        onToggle={(id) => {
          const u = users.data?.find((x) => String(x.id) === id);
          if (!u) return;
          api
            .patch(`/api/v3/access/users/${u.id}`, { active: !u.active, version: u.version })
            .then(
              () => (setMsg([`Akun ${u.email ?? u.display_name} ${u.active ? 'dinonaktifkan' : 'diaktifkan'}.`, false]), users.reload()),
            )
            .catch((e: unknown) => setMsg([errText(e), true]));
        }}
      />
    </>
  );
}

const PERM_LABEL: Readonly<Record<string, string>> = {
  'dashboard.view': 'Lihat dashboard',
  'meeting.use': 'Mode Meeting',
  'dashboard.investigate': 'Detail investigasi (laporan mentah)',
  'export.run': 'Ekspor laporan',
  'config.view': 'Lihat konfigurasi',
  'config.edit': 'Ubah konfigurasi',
  'users.manage': 'Kelola akun & role',
  'devices.manage': 'Kelola perangkat kiosk',
  'audit.view': 'Lihat audit log',
};

export function PermissionsPanel() {
  const roles = useApi<RoleRec[]>('/api/v3/access/roles');
  const list = roles.data ?? [];
  return (
    <section className="settings-card">
      <header>
        <h3>Hak akses per role</h3>
        <span className="settings-state">Diperiksa server</span>
      </header>
      <p className="settings-help">Atur hak akses role bawaan dan custom melalui tab Kelola Role.</p>
      <div className="settings-table">
        <table>
          <thead>
            <tr>
              <th scope="col">Izin</th>
              {list.map((r) => (
                <th scope="col" key={r.code}>
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(PERM_LABEL).map(([p, l]) => (
              <tr key={p}>
                <th scope="row">{l}</th>
                {list.map((r) => (
                  <td key={r.code}>
                    {r.permissions.includes(p) || (p === 'config.view' && r.permissions.includes('config.edit')) ? '✓' : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------- Custom Role (port rolePanel) ----------
function RoleSettingsAccess({ role }: { readonly role: RoleRec | null }) {
  const has = (p: string) => role?.permissions.includes(p) ?? false;
  const writePermissions = ['config.edit', 'users.manage', 'devices.manage'];
  const wasEditor = writePermissions.some(has);
  const [level, setLevel] = useState(wasEditor ? 'edit' : has('config.view') || has('audit.view') ? 'view' : 'none');
  return (
    <section>
      <h3>Settings</h3>
      <label className="fld">
        Akses Settings
        <select name="settingsLevel" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="none" disabled={role?.code === 'admin'}>
            Tanpa akses
          </option>
          <option value="view" disabled={role?.code === 'admin'}>
            Hanya lihat
          </option>
          <option value="edit">Lihat dan edit</option>
        </select>
      </label>
      {level !== 'none' && (
        <>
          {level === 'edit' &&
            writePermissions.map((p) => (
              <label className="ck" key={p}>
                {PERM_LABEL[p]}
                <input
                  type="checkbox"
                  name="settingsPermission"
                  value={p}
                  defaultChecked={has(p) || (p === 'config.edit' && !wasEditor)}
                  disabled={role?.code === 'admin' && p === 'users.manage'}
                />
              </label>
            ))}
          <label className="ck">
            Lihat konfigurasi produksi
            <input
              type="checkbox"
              name="settingsPermission"
              value="config.view"
              defaultChecked={has('config.view') || has('config.edit') || (!wasEditor && !has('audit.view'))}
            />
          </label>
          <label className="ck">
            {PERM_LABEL['audit.view']}
            <input type="checkbox" name="settingsPermission" value="audit.view" defaultChecked={has('audit.view')} />
          </label>
        </>
      )}
      {role?.code === 'admin' && <small>Admin selalu dapat mengelola akun dan role.</small>}
    </section>
  );
}

export function RolesPanel() {
  const { can, refresh, me } = useAuth();
  const roles = useApi<RoleRec[]>('/api/v3/access/roles');
  const audit = useApi<{ id: number; at: string; action: string; target: string | null }[]>(
    can('audit.view') ? '/api/v3/access/audit?limit=100' : null,
  );
  const [edit, setEdit] = useState<RoleRec | null>(null);
  const [msg, setMsg] = useState<[string, boolean]>(['', false]);
  const [revision, setRevision] = useState(0);
  const groups: [string, readonly (readonly [string, string])[]][] = [
    ['Dashboard', MENU_OPTIONS.slice(0, 3)],
    ['Produksi', MENU_OPTIONS.slice(3, 7)],
    ['Laporan & administrasi', MENU_OPTIONS.slice(7).filter(([key]) => key !== 'settings')],
  ];
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const label = String(f.get('label') ?? '').trim();
    const menus = f.getAll('menus').map(String);
    for (const key of edit?.menus ?? []) if (!MENU_OPTIONS.some(([id]) => id === key)) menus.push(key);
    if (!label) return setMsg(['Isi nama role.', true]);
    const level = String(f.get('settingsLevel'));
    const settings = f.getAll('settingsPermission').map(String);
    if (edit?.code === 'admin') settings.push('users.manage');
    if (level === 'edit' && !settings.some((p) => ['config.edit', 'users.manage', 'devices.manage'].includes(p)))
      return setMsg(['Pilih bagian Settings yang boleh diubah.', true]);
    if (level !== 'none' && !settings.length) return setMsg(['Pilih bagian Settings yang boleh dilihat.', true]);
    if (settings.length) menus.push('settings');
    if (!menus.length) return setMsg(['Pilih minimal satu menu.', true]);
    const code =
      edit?.code ??
      (label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) ||
        `role-${Date.now().toString(36)}`);
    const permissions = [...f.getAll('permission').map(String), ...settings];
    if (menus.some((m) => m !== 'settings') && !permissions.includes('dashboard.view'))
      return setMsg(['Aktifkan izin lihat dashboard untuk menu dashboard yang dipilih.', true]);
    if (menus.includes('export') && !permissions.includes('export.run'))
      return setMsg(['Aktifkan izin ekspor untuk menu Export Data.', true]);
    api
      .put(`/api/v3/access/roles/${code}`, { name: label, permissions, menus, ...(edit ? { version: edit.version } : {}) })
      .then(() => {
        setMsg([`Role ${label} disimpan.`, false]);
        setEdit(null);
        setRevision((n) => n + 1);
        if (me?.role === code) void refresh().catch(() => undefined);
        roles.reload();
        audit.reload();
      })
      .catch((err: unknown) => setMsg([errText(err), true]));
  };
  const roleLog = (audit.data ?? []).filter((a) => a.action.startsWith('role.') || a.action.startsWith('device.'));
  return (
    <>
      <Feedback msg={msg[0]} error={msg[1]} />
      <div className="velvet-role-layout">
        <aside className="velvet-role-list">
          <h2>Roles &amp; Permissions</h2>
          {(roles.data ?? []).map((r) => (
            <div className="sec" key={r.code}>
              <div>
                <b>{r.name}</b>
                <div className="sb">{r.is_builtin ? 'Role bawaan' : 'Role custom'}</div>
              </div>
              <div className="act">
                <button
                  className="btn"
                  type="button"
                  data-role-edit={r.code}
                  disabled={r.code === 'admin' && me?.role !== 'admin'}
                  onClick={() => setEdit(r)}
                >
                  Edit
                </button>
                {!r.is_builtin && (
                  <button
                    className="btn"
                    type="button"
                    data-role-delete={r.code}
                    onClick={() =>
                      api
                        .del(`/api/v3/access/roles/${r.code}`)
                        .then(() => (setMsg([`Role ${r.name} dihapus.`, false]), roles.reload(), audit.reload()))
                        .catch((err: unknown) => setMsg([errText(err), true]))
                    }
                  >
                    Hapus
                  </button>
                )}
              </div>
            </div>
          ))}
        </aside>
        <section className="card">
          <h2>{edit ? `Edit role · ${edit.name}` : 'Buat role'}</h2>
          <form id="custom-role-form" key={`${edit?.code ?? 'new'}-${revision}`} onSubmit={submit}>
            <label className="fld">
              Nama role
              <input required name="label" maxLength={60} defaultValue={edit?.name ?? ''} />
            </label>
            <div className="velvet-perms">
              {groups.map(([title, items]) => (
                <section key={title}>
                  <h3>{title}</h3>
                  {items.map(([id, n]) => (
                    <label className="ck" key={id}>
                      {n}
                      <input
                        type="checkbox"
                        name="menus"
                        value={id}
                        defaultChecked={Boolean(
                          edit &&
                          (!edit.menus.length || edit.menus.includes(id)) &&
                          (id !== 'export' || edit.permissions.includes('export.run')),
                        )}
                      />
                    </label>
                  ))}
                </section>
              ))}
              <section>
                <h3>Fitur dashboard</h3>
                {['dashboard.view', 'meeting.use', 'dashboard.investigate', 'export.run'].map((p) => (
                  <label className="ck" key={p}>
                    {PERM_LABEL[p]}
                    <input
                      type="checkbox"
                      name="permission"
                      value={p}
                      defaultChecked={edit ? edit.permissions.includes(p) : ['dashboard.view', 'meeting.use'].includes(p)}
                    />
                  </label>
                ))}
              </section>
              <RoleSettingsAccess role={edit} />
            </div>
            {edit && (
              <button className="btn" type="button" onClick={() => setEdit(null)}>
                Batal
              </button>
            )}
            <button className="btn velvet-action">Simpan role</button>
          </form>
        </section>
      </div>
      {can('audit.view') && (
        <section className="card velvet-audit">
          <h2>Audit Log · Role &amp; Perangkat</h2>
          {roleLog.length ? (
            roleLog.slice(0, 20).map((x) => (
              <p key={x.id}>
                {x.action}
                {x.target ? ` · ${x.target}` : ''}
                <br />
                <small>{new Date(x.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</small>
              </p>
            ))
          ) : (
            <p>Belum ada perubahan role atau perangkat.</p>
          )}
        </section>
      )}
    </>
  );
}

// ---------- Device Management (port devicePanel) ----------
const deviceScreens = { line: 'Per Line', hub: 'TV Departemen · Master Dashboard Utama', executive: 'TV Departemen · Executive' } as const;
type DeviceScreen = keyof typeof deviceScreens;

interface Devices {
  readonly devices: readonly {
    id: number;
    name: string;
    location: string | null;
    line_code: string | null;
    screen: DeviceScreen;
    last_seen_at: string | null;
    revoked_at: string | null;
  }[];
  readonly pending: readonly {
    id: number;
    line_code: string | null;
    screen: DeviceScreen;
    device_name: string | null;
    expires_at: string;
  }[];
}

export function DevicesPanel({ lines }: { readonly lines: readonly string[] }) {
  const [screen, setScreen] = useState<DeviceScreen>('line');
  const dev = useApi<Devices>('/api/v3/access/devices');
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [msg, setMsg] = useState<[string, boolean]>(['', false]);
  const [revoking, setRevoking] = useState<number | null>(null);
  const revoked = (dev.data?.devices ?? []).filter((d) => d.revoked_at);
  const stamp = (value: string) => new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const screenLabel = (d: { screen: DeviceScreen; line_code: string | null }) =>
    d.screen === 'line' ? (d.line_code ?? 'Per Line') : deviceScreens[d.screen];
  const revoke = async (d: Devices['devices'][number]) => {
    if (revoking !== null) return;
    setRevoking(d.id);
    try {
      await api.post(`/api/v3/access/devices/${d.id}/revoke`);
      setMsg([`Akses ${d.name} (#${d.id}) dicabut.`, false]);
    } catch (err) {
      setMsg([errText(err), true]);
    } finally {
      dev.reload();
      setRevoking(null);
    }
  };
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    api
      .post<{ code: string; expiresAt: string }>('/api/v3/access/devices/pairing-codes', {
        location: 'internal',
        screen,
        line_code: screen === 'line' ? String(f.get('line') ?? '') || undefined : undefined,
        name: String(f.get('name') ?? '').trim(),
      })
      .then((r) => (setCode(r.data), dev.reload()))
      .catch((err: unknown) => setMsg([errText(err), true]));
  };
  return (
    <>
      <Feedback msg={msg[0]} error={msg[1]} />
      <section className="card">
        <h2>Daftarkan iPad atau TV Departemen</h2>
        <p className="sb">Masukkan kode sekali pakai di layar login perangkat melalui tombol Hubungkan perangkat.</p>
        <form id="device-form" onSubmit={submit}>
          <label className="fld">
            Nama perangkat
            <input name="name" required maxLength={80} />
          </label>
          <label className="fld">
            Tampilan perangkat
            <select
              value={screen}
              onChange={(e) => {
                setScreen(e.target.value as DeviceScreen);
                setCode(null);
              }}
            >
              {Object.entries(deviceScreens).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {screen === 'line' && (
            <label className="fld">
              Lokasi / Line
              <select name="line" required>
                {lines.map((l) => (
                  <option key={l} value={l}>
                    {siteName('internal')} · {l}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="btn velvet-action">Generate pairing code</button>
        </form>
        {code ? (
          <p className="settings-feedback" role="status">
            Kode pairing:{' '}
            <strong style={{ fontSize: 20, letterSpacing: '.12em' }}>{`${code.code.slice(0, 4)}-${code.code.slice(4)}`}</strong> · berlaku
            sampai {new Date(code.expiresAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })}. Kode hanya ditampilkan sekali.
          </p>
        ) : null}
      </section>
      <section className="settings-card settings-list">
        <h2>Perangkat terdaftar</h2>
        {dev.error && (
          <p role="alert">
            {dev.error}{' '}
            <button className="btn" onClick={dev.reload}>
              Muat ulang
            </button>
          </p>
        )}
        {dev.loading && <p role="status">Memuat perangkat…</p>}
        {dev.data && (
          <>
            <div className="settings-table">
              <table aria-label="Perangkat aktif dan menunggu pairing">
                <thead>
                  <tr>
                    <th>Perangkat</th>
                    <th>Tampilan</th>
                    <th>Status</th>
                    <th>Waktu (WIB)</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {dev.data.devices
                    .filter((d) => !d.revoked_at)
                    .map((d) => (
                      <tr key={d.id}>
                        <th scope="row">
                          {d.name} <small>#{d.id}</small>
                        </th>
                        <td>{screenLabel(d)}</td>
                        <td>Akses aktif</td>
                        <td>{d.last_seen_at ? 'Terakhir diakses ' + stamp(d.last_seen_at) : 'Belum diakses'}</td>
                        <td>
                          <button
                            className="btn"
                            type="button"
                            data-device-revoke={d.id}
                            disabled={revoking !== null || dev.loading}
                            onClick={() => void revoke(d)}
                          >
                            Cabut akses
                          </button>
                        </td>
                      </tr>
                    ))}
                  {dev.data.pending.map((p) => (
                    <tr key={'pending-' + p.id}>
                      <th scope="row">{p.device_name ?? 'Perangkat baru'}</th>
                      <td>{screenLabel(p)}</td>
                      <td>Menunggu pairing</td>
                      <td>Kode berlaku sampai {stamp(p.expires_at)}</td>
                      <td>—</td>
                    </tr>
                  ))}
                  {!dev.data.devices.some((d) => !d.revoked_at) && !dev.data.pending.length && (
                    <tr>
                      <td colSpan={5}>Belum ada perangkat aktif atau menunggu pairing.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {revoked.length > 0 && (
              <details>
                <summary>Riwayat akses dicabut ({revoked.length})</summary>
                <div className="settings-table">
                  <table aria-label="Riwayat akses dicabut">
                    <thead>
                      <tr>
                        <th>Perangkat</th>
                        <th>Tampilan</th>
                        <th>Dicabut pada (WIB)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revoked.map((d) => (
                        <tr key={d.id}>
                          <th scope="row">
                            {d.name} <small>#{d.id}</small>
                          </th>
                          <td>{screenLabel(d)}</td>
                          <td>{stamp(d.revoked_at ?? '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </>
        )}
      </section>
    </>
  );
}

// ---------- Riwayat & Backup ----------
export function AuditPanel() {
  const { can } = useAuth();
  const { raw, reload } = useConfig();
  const audit = useApi<{ id: number; at: string; actor_type: string; actor_id: number | null; action: string; target: string | null }[]>(
    can('audit.view') ? '/api/v3/access/audit?limit=100' : null,
  );
  const [msg, setMsg] = useState<[string, boolean]>(['', false]);
  const [file, setFile] = useState<File | null>(null);
  const backup = (): void => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: Object.fromEntries([...raw.entries()].map(([k, v]) => [k, v.value])),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const restore = async (): Promise<void> => {
    if (!file) return setMsg(['Pilih file backup JSON dulu.', true]);
    if (file.size > 1_000_000) return setMsg(['File terlalu besar (maks. 1 MB).', true]);
    let data: { version?: number; settings?: Record<string, unknown> };
    try {
      data = JSON.parse(await file.text()) as typeof data;
    } catch {
      return setMsg(['File bukan JSON yang valid.', true]);
    }
    if (data.version !== 1 || !data.settings || typeof data.settings !== 'object') return setMsg(['Format backup tidak dikenal.', true]);
    const entries = Object.entries(data.settings).filter(
      ([k, v]) => /^(config\.[a-z]+|line_status|line_discovery)$/.test(k) && v && typeof v === 'object',
    );
    if (!entries.length) return setMsg(['Tidak ada pengaturan yang bisa dipulihkan.', true]);
    let ok = 0;
    const failed: string[] = [];
    for (const [k, v] of entries) {
      const version = raw.get(k)?.version;
      try {
        await api.put(`/api/v3/settings/${k}`, { value: v, ...(version ? { version } : {}) });
        ok += 1;
      } catch (e) {
        failed.push(`${k}: ${errText(e)}`);
      }
    }
    reload();
    setMsg([`${ok} pengaturan dipulihkan.${failed.length ? ` Gagal: ${failed.join('; ')}` : ''}`, failed.length > 0]);
  };
  return (
    <>
      <Feedback msg={msg[0]} error={msg[1]} />
      {can('config.edit') && (
        <section className="settings-card">
          <header>
            <h3>Backup konfigurasi</h3>
          </header>
          <p className="settings-help">
            Backup berisi pengaturan (Identitas, KPI, Tampilan, Mesin, Produk, Penyebab, Defect, Peringatan, status line). Akun, line,
            target dan kalender ada di database — backup lewat pg_dump.
          </p>
          <div className="settings-backup">
            <button className="btn" type="button" data-setting-backup onClick={backup}>
              <Icon name="dl" size={16} /> Unduh JSON
            </button>
            <label htmlFor="settings-restore">
              Pilih backup JSON
              <input
                id="settings-restore"
                type="file"
                accept=".json,application/json"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button className="btn pri" type="button" data-setting-restore onClick={() => void restore()}>
              Verifikasi &amp; pulihkan
            </button>
          </div>
        </section>
      )}
      {can('audit.view') && (
        <section className="settings-card">
          <header>
            <h3>Perubahan terbaru</h3>
          </header>
          <div className="settings-table">
            <table>
              <thead>
                <tr>
                  <th>Pengaturan</th>
                  <th>Aksi</th>
                  <th>Akun</th>
                  <th>Waktu</th>
                </tr>
              </thead>
              <tbody>
                {audit.data?.length ? (
                  audit.data.map((r) => (
                    <tr key={r.id}>
                      <th scope="row">{r.target ?? '—'}</th>
                      <td>{r.action}</td>
                      <td>
                        {r.actor_type}
                        {r.actor_id ? ` #${r.actor_id}` : ''}
                      </td>
                      <td>{new Date(r.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>{can('audit.view') ? 'Belum ada perubahan.' : 'Butuh izin audit.view.'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
