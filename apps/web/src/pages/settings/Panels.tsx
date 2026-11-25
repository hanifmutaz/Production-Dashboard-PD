// Panel Settings yang memakai API asli (bukan penyimpanan settings generik).
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmt, MON } from '../../lib/format';
import { Icon } from '../../lib/icons';
import { useConfig } from '../../lib/kpi';
import { siteName, SITES } from '../../lib/sites';
import { useApi } from '../../lib/useApi';
import { Editor, ListTable, type Lookups } from './Fields';
import { MENU_OPTIONS, SPEC, type Field } from './spec';
import { useSaveSetting } from './Settings';

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
  const disc = useApi<string[]>('/api/v3/lines/discover');
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
    </>
  );
}

// ---------- Target Produksi ----------
interface Plan {
  readonly locations: readonly { location: string; target: number; version: number }[];
  readonly lines: readonly { line_code: string; target: number; work_days: number; note: string; version: number }[];
}

export function PlanningPanel({ lookups }: { readonly lookups: Lookups }) {
  const { me } = useAuth();
  const [period, setPeriod] = useState((me?.today ?? '').slice(0, 7));
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5));
  const plan = useApi<Plan>(`/api/v3/planning?year=${y}&month=${m}`);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<[string, boolean]>(['', false]);
  const rows = [
    ...(plan.data?.locations ?? []).map((l) => ({
      id: `loc:${l.location}`,
      active: true,
      title: siteName(l.location),
      detail: [period, `${fmt(Number(l.target))} pcs`, 'Target lokasi'],
    })),
    ...(plan.data?.lines ?? []).map((l) => ({
      id: `line:${l.line_code}`,
      active: true,
      title: `${siteName('internal')} · ${l.line_code}`,
      detail: [period, `${fmt(Number(l.target))} pcs`, `${l.work_days} hari`, l.note],
    })),
  ];
  const locRec = editing?.startsWith('loc:') ? plan.data?.locations.find((l) => `loc:${l.location}` === editing) : undefined;
  const lineRec = editing?.startsWith('line:') ? plan.data?.lines.find((l) => `line:${l.line_code}` === editing) : undefined;
  const record = locRec
    ? { id: editing, site: locRec.location, line: '', period, qty: Number(locRec.target), days: 1, note: '' }
    : lineRec
      ? {
          id: editing,
          site: 'internal',
          line: lineRec.line_code,
          period,
          qty: Number(lineRec.target),
          days: lineRec.work_days,
          note: lineRec.note,
        }
      : { site: 'internal', line: '', period, days: 21 };
  return (
    <>
      <Feedback msg={msg[0]} error={msg[1]} />
      {editing ? (
        <Editor
          section="planning"
          label="Target"
          isList
          lookups={lookups}
          record={record}
          onCancel={() => setEditing(null)}
          onSave={async (v) => {
            const [py, pm] = String(v['period']).split('-').map(Number);
            try {
              if (v['line']) {
                await api.put('/api/v3/planning/line', {
                  line_code: v['line'],
                  year: py,
                  month: pm,
                  target: v['qty'],
                  work_days: v['days'],
                  note: v['note'] ?? '',
                  ...(lineRec && String(v['line']) === lineRec.line_code && String(v['period']) === period
                    ? { version: lineRec.version }
                    : {}),
                });
              } else {
                const existing = String(v['period']) === period ? plan.data?.locations.find((l) => l.location === v['site']) : undefined;
                await api.put('/api/v3/executive/target', {
                  year: py,
                  month: pm,
                  tempat: v['site'],
                  target: v['qty'],
                  ...(existing ? { version: existing.version } : {}),
                });
              }
            } catch (e) {
              throw new Error(errText(e), { cause: e });
            }
            setMsg(['Target disimpan.', false]);
            setEditing(null);
            plan.reload();
          }}
        />
      ) : null}
      <ListTable
        label={`Target ${MON[m - 1] ?? ''} ${y}`}
        rows={rows}
        onEdit={setEditing}
        headerExtra={
          <div className="settings-tabs">
            <input
              type="month"
              value={period}
              min="2024-01"
              max="2099-12"
              aria-label="Bulan target"
              onChange={(e) => e.target.value && setPeriod(e.target.value)}
            />
            <button className="btn pri" type="button" onClick={() => setEditing('new')}>
              <Icon name="plus" size={16} /> Tambah
            </button>
          </div>
        }
      />
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
                  ...(rec.email !== v['email'] ? {email: v['email']} : {}),
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
            .then(() => (setMsg([`Akun ${u.email ?? u.display_name} ${u.active ? 'dinonaktifkan' : 'diaktifkan'}.`, false]), users.reload()))
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
      <p className="settings-help">Role bawaan tidak bisa diubah. Buat Custom Role untuk kombinasi lain.</p>
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
                  <td key={r.code}>{r.permissions.includes(p) ? '✓' : '—'}</td>
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
export function RolesPanel() {
  const roles = useApi<RoleRec[]>('/api/v3/access/roles');
  const audit = useApi<{ id: number; at: string; action: string; target: string | null }[]>('/api/v3/access/audit?limit=100');
  const [edit, setEdit] = useState<RoleRec | null>(null);
  const [msg, setMsg] = useState<[string, boolean]>(['', false]);
  const custom = (roles.data ?? []).filter((r) => !r.is_builtin);
  const groups: [string, readonly (readonly [string, string])[]][] = [
    ['Dashboard', MENU_OPTIONS.slice(0, 3)],
    ['Produksi', MENU_OPTIONS.slice(3, 7)],
    ['Laporan & administrasi', MENU_OPTIONS.slice(7)],
  ];
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const label = String(f.get('label') ?? '').trim();
    const menus = f.getAll('menus').map(String);
    if (!label) return setMsg(['Isi nama role.', true]);
    if (!menus.length) return setMsg(['Pilih minimal satu akses.', true]);
    const code =
      edit?.code ??
      (label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) ||
        `role-${Date.now().toString(36)}`);
    const permissions = ['dashboard.view', 'meeting.use', ...(menus.includes('export') ? ['export.run'] : [])];
    api
      .put(`/api/v3/access/roles/${code}`, { name: label, permissions, menus, ...(edit ? { version: edit.version } : {}) })
      .then(() => {
        setMsg([`Role ${label} disimpan.`, false]);
        setEdit(null);
        e.currentTarget?.reset();
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
          {['Admin', 'Supervisor', 'Viewer'].map((r) => (
            <div className="sec" key={r}>
              <b>{r}</b>
              <small>Role bawaan</small>
            </div>
          ))}
          {custom.map((r) => (
            <div className="sec" key={r.code}>
              <div>
                <b>{r.name}</b>
                <div className="sb">
                  {r.menus.length} dari {MENU_OPTIONS.length} akses
                </div>
              </div>
              <div className="act">
                <button className="btn" type="button" data-role-edit={r.code} onClick={() => setEdit(r)}>
                  Edit
                </button>
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
              </div>
            </div>
          ))}
        </aside>
        <section className="card">
          <h2>Custom Role</h2>
          <p className="sb">Buat role atau pilih Edit. Role bawaan dilindungi.</p>
          <form id="custom-role-form" key={edit?.code ?? 'new'} onSubmit={submit}>
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
                      <input type="checkbox" name="menus" value={id} defaultChecked={edit?.menus.includes(id) ?? false} />
                    </label>
                  ))}
                </section>
              ))}
            </div>
            <button className="btn velvet-action">Simpan role</button>
          </form>
        </section>
      </div>
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
    </>
  );
}

// ---------- Device Management (port devicePanel) ----------
interface Devices {
  readonly devices: readonly {
    id: number;
    name: string;
    location: string | null;
    line_code: string | null;
    last_seen_at: string | null;
    revoked_at: string | null;
  }[];
  readonly pending: readonly { id: number; line_code: string | null; device_name: string | null; expires_at: string }[];
}

export function DevicesPanel({ lines }: { readonly lines: readonly string[] }) {
  const dev = useApi<Devices>('/api/v3/access/devices');
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [msg, setMsg] = useState<[string, boolean]>(['', false]);
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    api
      .post<{ code: string; expiresAt: string }>('/api/v3/access/devices/pairing-codes', {
        location: 'internal',
        line_code: String(f.get('line') ?? '') || undefined,
        name: String(f.get('name') ?? '').trim(),
      })
      .then((r) => (setCode(r.data), dev.reload()))
      .catch((err: unknown) => setMsg([errText(err), true]));
  };
  return (
    <>
      <Feedback msg={msg[0]} error={msg[1]} />
      <section className="card">
        <h2>Daftarkan iPad / Kiosk</h2>
        <p className="sb">Kode sekali pakai, berlaku 10 menit. Masukkan di layar login iPad → "Hubungkan iPad".</p>
        <form id="device-form" onSubmit={submit}>
          <label className="fld">
            Nama perangkat
            <input name="name" required maxLength={80} />
          </label>
          <label className="fld">
            Lokasi / Line
            <select name="line">
              {lines.map((l) => (
                <option key={l} value={l}>
                  {siteName('internal')} · {l}
                </option>
              ))}
            </select>
          </label>
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
      <section className="card">
        <h2>Perangkat terdaftar</h2>
        <div className="velvet-device-grid">
          {(dev.data?.pending ?? []).map((p) => (
            <div className="sec" key={`p${p.id}`}>
              <div className="velvet-device-icon">
                <Icon name="tablet" size={32} />
              </div>
              <b>{p.device_name ?? 'Perangkat baru'}</b>
              <div className="sb">{p.line_code ?? '—'} · Menunggu pairing</div>
              <strong></strong>
            </div>
          ))}
          {(dev.data?.devices ?? []).map((d) => (
            <div className="sec" key={d.id}>
              <div className="velvet-device-icon">
                <Icon name="tablet" size={32} />
              </div>
              <b>{d.name}</b>
              <div className="sb">
                {d.line_code ?? '—'} ·{' '}
                {d.revoked_at
                  ? 'Dicabut'
                  : d.last_seen_at
                    ? `Terpasang · terakhir ${new Date(d.last_seen_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`
                    : 'Terpasang'}
              </div>
              <strong></strong>
              <button
                className="btn"
                type="button"
                data-device-revoke={d.id}
                disabled={Boolean(d.revoked_at)}
                onClick={() =>
                  api
                    .post(`/api/v3/access/devices/${d.id}/revoke`)
                    .then(() => (setMsg([`Akses ${d.name} dicabut.`, false]), dev.reload()))
                    .catch((err: unknown) => setMsg([errText(err), true]))
                }
              >
                Cabut akses
              </button>
            </div>
          ))}
        </div>
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
      <section className="settings-card">
        <header>
          <h3>Backup konfigurasi</h3>
        </header>
        <p className="settings-help">
          Backup berisi pengaturan (Identitas, KPI, Tampilan, Mesin, Produk, Penyebab, Defect, Peringatan, status line). Akun, line, target
          dan kalender ada di database — backup lewat pg_dump.
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
    </>
  );
}
