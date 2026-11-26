// Port settingsView mockup: 11 section. Data disimpan di server (settings versioned + API master/akses).
import { useState, type ReactNode } from 'react';
import { RUNNING_FIELDS, RUNNING_FIELD_LABEL, type LineStatusSettings } from '@v3/shared';
import { AchievementLegend } from '../../lib/achievement';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmt } from '../../lib/format';
import { Icon } from '../../lib/icons';
import { useConfig } from '../../lib/kpi';
import { siteName, SITES } from '../../lib/sites';
import { useApi } from '../../lib/useApi';
import { WorkCalendar } from '../WorkCalendar';
import { Editor, ListTable, type Lookups } from './Fields';
import { AuditPanel, DevicesPanel, LinesPanel, PermissionsPanel, PlanningPanel, RolesPanel, UsersPanel } from './Panels';
import { DEFAULTS, LIST_DEFAULT_ROWS, SETTINGS_GROUPS, SETTINGS_SECTIONS, SPEC } from './spec';

type Rows = Record<string, unknown>[];

const DETAIL: Readonly<Record<string, string>> = {
  planning: 'Target lokasi dipakai di Executive. Target line dipakai di Monitoring Output.',
  kpi: 'Warna diukur dari pencapaian terhadap target masing-masing metrik. Bekidoritsu dan achievement output dibandingkan dengan plan.',
  source:
    'Mapping kolom yang dipakai server ada di config/reportColumns.js (divalidasi npm run validate:columns). Field di sini adalah catatan & ambang keterlambatan.',
  access: 'Role, izin, dan cakupan lokasi diperiksa di server untuk setiap request.',
  alerts: 'Peringatan muncul di Master Hub. Output memicu saat di bawah ambang. Reject dan stoptime memicu saat di atas ambang.',
};

export function useSaveSetting(): (key: string, value: Record<string, unknown>) => Promise<void> {
  const { raw, reload } = useConfig();
  return async (key, value) => {
    const version = raw.get(key)?.version;
    try {
      await api.put(`/api/v3/settings/${key}`, { value, ...(version ? { version } : {}) });
    } catch (e) {
      throw new Error(e instanceof ApiError ? e.message : 'Gagal menyimpan.', { cause: e });
    } finally {
      reload();
    }
  };
}

function detailOf(key: string, row: Record<string, unknown>): (string | null)[] {
  const s = (k: string): string | null => (row[k] ? String(row[k]) : null);
  switch (key) {
    case 'machines':
      return [row['site'] ? siteName(String(row['site'])) : null, s('line'), s('code')];
    case 'products':
      return [s('code'), row['external'] ? `ConMas ${String(row['external'])}` : null];
    case 'causes':
      return [
        s('code'),
        s('category'),
        ({ availability: 'Availability Loss', quality: 'Quality Loss', performance: 'Performance Loss' } as Record<string, string>)[
          String(row['loss'])
        ] ?? null,
      ];
    case 'defects':
      return [s('code')];
    case 'alerts':
      return [
        ({ achievement: 'Pencapaian output (%)', reject: 'Reject (PPM)', stop: 'Stoptime (menit)' } as Record<string, string>)[
          String(row['metric'])
        ] ?? null,
        row['site'] ? siteName(String(row['site'])) : 'Semua lokasi',
        fmt(Number(row['threshold'] ?? 0)),
      ];
  }
  return [];
}

function ConfigList({ section, label, lookups }: { readonly section: string; readonly label: string; readonly lookups: Lookups }) {
  const { raw } = useConfig();
  const save = useSaveSetting();
  const canEdit = useAuth().can('config.edit');
  const key = `config.${section}`;
  const stored = (raw.get(key)?.value as { rows?: Rows } | undefined)?.rows;
  const rows: Rows = stored ?? LIST_DEFAULT_ROWS[section] ?? [];
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const record =
    editing === 'new'
      ? ({
          ...(section === 'causes' ? { category: 'Machine', loss: 'availability' } : {}),
          ...(section === 'machines' ? { site: 'internal' } : {}),
        } as Record<string, unknown>)
      : rows.find((r) => r['id'] === editing);
  const persist = async (next: Rows, text: string): Promise<void> => {
    await save(key, { rows: next });
    setMsg(text);
  };
  return (
    <>
      {msg ? (
        <p id="settings-feedback" className="settings-feedback" role="status">
          {msg}
        </p>
      ) : null}
      {editing && record ? (
        <Editor
          section={section}
          label={label}
          record={record}
          isList
          lookups={lookups}
          onCancel={() => setEditing(null)}
          onSave={async (value) => {
            const id = editing === 'new' ? `${section}-${Date.now().toString(36)}` : editing;
            const row = { ...value, id, active: editing === 'new' ? true : Boolean(record['active']) };
            const next = editing === 'new' ? [...rows, row] : rows.map((r) => (r['id'] === id ? row : r));
            await persist(next, `${label} disimpan.`);
            setEditing(null);
          }}
        />
      ) : null}
      <ListTable
        label={label}
        readOnly={!canEdit}
        rows={rows.map((r) => ({
          id: String(r['id']),
          active: r['active'] === true,
          title: String(r['name'] ?? r['code'] ?? r['id']),
          detail: detailOf(section, r),
        }))}
        onNew={() => setEditing('new')}
        onEdit={setEditing}
        onToggle={(id) =>
          void persist(
            rows.map((r) => (r['id'] === id ? { ...r, active: !r['active'] } : r)),
            `Status ${label.toLowerCase()} diubah.`,
          ).catch((e: unknown) => setMsg(e instanceof Error ? e.message : 'Gagal.'))
        }
      />
    </>
  );
}

function ConfigEditor({ section, lookups, extra }: { readonly section: string; readonly lookups: Lookups; readonly extra?: ReactNode }) {
  const { raw } = useConfig();
  const save = useSaveSetting();
  const [msg, setMsg] = useState('');
  const record = { ...(DEFAULTS[section] ?? {}), ...((raw.get(`config.${section}`)?.value as Record<string, unknown> | undefined) ?? {}) };
  return (
    <>
      {msg ? (
        <p id="settings-feedback" className="settings-feedback" role="status">
          {msg}
        </p>
      ) : null}
      <Editor
        section={section}
        label=""
        record={record}
        isList={false}
        lookups={lookups}
        extra={extra}
        onSave={async (value) => {
          await save(`config.${section}`, value);
          setMsg('Perubahan disimpan.');
        }}
      />
    </>
  );
}

function LineStatusCard() {
  const eff = useApi<{ line_status: LineStatusSettings }>('/api/v3/settings/effective');
  const save = useSaveSetting();
  const [msg, setMsg] = useState('');
  const v = eff.data?.line_status;
  if (!v) return null;
  return (
    <section className="settings-card settings-editor">
      <header>
        <h3>Status line (Running / Waiting / Not Running)</h3>
      </header>
      <p className="settings-help">
        Line dianggap Running bila semua field di bawah terisi di laporan i-Reporter (angka 0 dihitung terisi). Belum lengkap: dalam masa
        tunggu → Waiting, lewat → Not Running.
      </p>
      <form
        key={JSON.stringify(v)}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const value = {
            requiredFields: RUNNING_FIELDS.filter((k) => f.get(`rf-${k}`) === 'on'),
            staleEnabled: f.get('staleEnabled') === 'on',
            staleThresholdMin: Number(f.get('staleThresholdMin')),
            staleInSummary: f.get('staleInSummary') === 'on',
          };
          save('line_status', value)
            .then(() => (setMsg('Aturan status line disimpan.'), eff.reload()))
            .catch((err: unknown) => setMsg(err instanceof Error ? err.message : 'Gagal.'));
        }}
      >
        <div className="settings-fields">
          {RUNNING_FIELDS.map((k) => (
            <div className="setting-field setting-check" key={k}>
              <label htmlFor={`rf-${k}`}>{RUNNING_FIELD_LABEL[k]} wajib terisi</label>
              <input id={`rf-${k}`} name={`rf-${k}`} type="checkbox" defaultChecked={v.requiredFields.includes(k)} />
            </div>
          ))}
          <div className="setting-field setting-check">
            <label htmlFor="staleEnabled">Cek output per jam (stale)</label>
            <input id="staleEnabled" name="staleEnabled" type="checkbox" defaultChecked={v.staleEnabled} />
          </div>
          <div className="setting-field">
            <label htmlFor="staleThresholdMin">Batas tanpa output per jam (menit)</label>
            <input
              id="staleThresholdMin"
              name="staleThresholdMin"
              type="number"
              min={15}
              max={1440}
              step={1}
              defaultValue={v.staleThresholdMin}
              required
            />
          </div>
          <div className="setting-field setting-check">
            <label htmlFor="staleInSummary">Cek stale juga di ringkasan</label>
            <input id="staleInSummary" name="staleInSummary" type="checkbox" defaultChecked={v.staleInSummary} />
          </div>
        </div>
        {msg ? (
          <p className="settings-feedback" role="status">
            {msg}
          </p>
        ) : null}
        <div className="settings-save">
          <button className="btn pri" type="submit">
            Simpan aturan status
          </button>
        </div>
      </form>
    </section>
  );
}

function ShiftsPanel() {
  const eff = useApi<{ shift: Record<string, number> }>('/api/v3/settings/effective');
  const s = eff.data?.shift ?? {};
  const h = (n: number | undefined): string => `${String(n ?? 0).padStart(2, '0')}:00`;
  const rows = [
    {
      id: '2-1',
      title: 'Shift 1 (2 Shift)',
      detail: [`${h(s['shift2StartHour'])}–${h(s['shift2EndHourWeekday'])}`, `Jumat s/d ${h(s['shift2EndHourFriday'])}`],
    },
    { id: '2-2', title: 'Shift 2 (2 Shift)', detail: [`${h(s['shift2NightStartHour'])}–${h(s['shift2StartHour'])} (lewat tengah malam)`] },
    { id: '3-1', title: 'Shift 1 (3 Shift)', detail: [`${h(s['shift3StartHour'])}–${h(s['shift3SecondStartHour'])}`] },
    { id: '3-2', title: 'Shift 2 (3 Shift)', detail: [`${h(s['shift3SecondStartHour'])}–${h(s['shift3ThirdStartHour'])}`] },
    { id: '3-3', title: 'Shift 3 (3 Shift)', detail: [`${h(s['shift3ThirdStartHour'])}–${h(s['shift3StartHour'])} (lewat tengah malam)`] },
  ].map((r) => ({ ...r, active: true }));
  return (
    <>
      <p className="settings-help settings-context">
        Jam shift dibaca server dari .env (SHIFT2_*, SHIFT3_*) agar logika shift konsisten di semua perangkat. Ubah lewat .env lalu restart
        server.
      </p>
      <ListTable label="Shift" rows={rows} />
      <p className="settings-help">
        Masa tunggu awal shift & batas Not Running: {s['lineStartGraceMin'] ?? '—'} / {s['lineNotRunningThresholdMin'] ?? '—'} menit.
      </p>
    </>
  );
}

function ExceptionsPanel() {
  const { me } = useAuth();
  const today = me?.today ?? '';
  const [period, setPeriod] = useState(today.slice(0, 7));
  const [open, setOpen] = useState(false);
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5));
  const cal = useApi<{ holidays: string[]; version: number | null }>(`/api/v3/executive/calendar?tempat=internal&year=${y}&month=${m}`);
  const rows = (cal.data?.holidays ?? []).map((d) => {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    return {
      id: d,
      active: true,
      title: d,
      detail: [siteName('internal'), 'Libur', dow === 0 || dow === 6 ? 'Akhir pekan' : 'Tanggal khusus'],
    };
  });
  return (
    <>
      <ListTable
        label="Kalender Kerja"
        rows={rows}
        headerExtra={
          <div className="settings-tabs">
            <label className="settings-search" style={{ margin: 0 }}>
              <input
                type="month"
                value={period}
                min="2024-01"
                max="2099-12"
                aria-label="Bulan kalender"
                onChange={(e) => e.target.value && setPeriod(e.target.value)}
              />
            </label>
            <button className="btn pri" type="button" data-work-calendar="all" onClick={() => setOpen(true)}>
              <Icon name="cal" size={16} /> Buka kalender
            </button>
          </div>
        }
      />
      {open ? (
        <WorkCalendar
          site="internal"
          year={y}
          month={m}
          onClose={(saved) => {
            setOpen(false);
            if (saved) cal.reload();
          }}
        />
      ) : null}
    </>
  );
}

function LocationsPanel() {
  const rows = SITES.map((s) => ({
    id: s,
    active: s === 'internal',
    title: siteName(s),
    detail: [s.toUpperCase(), s === 'internal' ? 'Sumber: i-Reporter (ConMas)' : 'On Hold · menunggu push-sync subcont'],
  }));
  return (
    <>
      <p className="settings-help settings-context">
        Lokasi tetap 3 (Internal, SGP, Systech). SGP & Systech aktif setelah SUBCONT_ENABLED=true dan push-sync tersambung.
      </p>
      <ListTable label="Lokasi" rows={rows} />
    </>
  );
}

function SourcePreview() {
  const { raw } = useConfig();
  const v = { ...(DEFAULTS['source'] ?? {}), ...((raw.get('config.source')?.value as Record<string, unknown> | undefined) ?? {}) };
  const fields = (SPEC['source'] ?? []).slice(3);
  const filled = fields.filter(([k]) => v[k]).length;
  return (
    <section className="settings-card">
      <header>
        <div>
          <h3>i-Reporter · ConMas</h3>
          <p>View {`view_report_25415`} · read-only</p>
        </div>
        <span className="settings-state active">Terhubung (server)</span>
      </header>
      <dl className="settings-source-list">
        <div>
          <dt>Kolom dicatat</dt>
          <dd>
            {filled} / {fields.length}
          </dd>
        </div>
        <div>
          <dt>Interval</dt>
          <dd>{String(v['refresh'])} detik</dd>
        </div>
        <div>
          <dt>Batas keterlambatan</dt>
          <dd>{String(v['stale'])} menit</dd>
        </div>
      </dl>
    </section>
  );
}

export function Settings() {
  const { can } = useAuth();
  const { raw } = useConfig();
  const [selected, setSection] = useState('kpi');
  const sections = SETTINGS_SECTIONS.filter(([id]) => {
    if (id === 'access') return can('users.manage') || can('devices.manage');
    if (id === 'audit') return can('audit.view') || can('config.edit');
    return can('config.view');
  });
  const section = sections.find(([id]) => id === selected)?.[0] ?? sections[0]?.[0] ?? '';
  const groups = SETTINGS_GROUPS[section]?.filter(
    ([id]) => section !== 'access' || can(id === 'devices' ? 'devices.manage' : 'users.manage'),
  );
  const [group, setGroup] = useState<Record<string, string>>({});
  const lines = useApi<{ line_code: string; product: string; location: string }[]>(
    can('config.view') ? '/api/v3/lines/all' : can('devices.manage') ? '/api/v3/lines' : null,
  );
  if (!sections.length) return null;
  const key = groups ? (groups.find(([id]) => id === group[section])?.[0] ?? groups[0]?.[0] ?? section) : section;
  const products = ((raw.get('config.products')?.value as { rows?: Rows } | undefined)?.rows ?? [])
    .filter((r) => r['active'])
    .map((r) => [String(r['code']), String(r['name'])] as const);
  const lookups: Lookups = { lines: (lines.data ?? []).map((l) => l.line_code), products };
  const [, title, , subtitle] = SETTINGS_SECTIONS.find(([k]) => k === section) ?? ['', '', '', ''];
  const label = groups?.find(([k]) => k === key)?.[1] ?? title;
  let body: ReactNode;
  switch (key) {
    case 'general':
    case 'source':
    case 'display':
      body = <ConfigEditor section={key} lookups={lookups} />;
      break;
    case 'kpi':
      body = (
        <>
          <ConfigEditor section="kpi" lookups={lookups} extra={<KpiPreview />} />
          <LineStatusCard />
        </>
      );
      break;
    case 'machines':
    case 'products':
    case 'causes':
    case 'defects':
    case 'alerts':
      body = <ConfigList section={key} label={label} lookups={lookups} />;
      break;
    case 'locations':
      body = <LocationsPanel />;
      break;
    case 'lines':
      body = <LinesPanel lookups={lookups} onChange={lines.reload} />;
      break;
    case 'planning':
      body = <PlanningPanel master={lines} />;
      break;
    case 'shifts':
      body = <ShiftsPanel />;
      break;
    case 'exceptions':
      body = <ExceptionsPanel />;
      break;
    case 'users':
      body = <UsersPanel />;
      break;
    case 'permissions':
      body = <PermissionsPanel />;
      break;
    case 'customRoles':
      body = <RolesPanel />;
      break;
    case 'devices':
      body = <DevicesPanel lines={lookups.lines} />;
      break;
    case 'audit':
      body = <AuditPanel />;
      break;
    default:
      body = null;
  }
  return (
    <div className="page">
      <div className="settings-workspace">
        <div className="settings-intro">
          <div>
            <p>Konfigurasi dashboard produksi</p>
            <span>
              {can('config.edit')
                ? 'Perubahan tersimpan di server dan tercatat di audit log.'
                : can('config.view')
                  ? 'Konfigurasi produksi · Hanya lihat'
                  : 'Administrasi sesuai hak akses role.'}
            </span>
          </div>
        </div>
        <div className="settings-layout">
          <nav className="settings-menu" aria-label="Kategori Settings">
            {sections.map(([id, l, icon]) => (
              <button
                key={id}
                type="button"
                className="settings-nav-button"
                data-setting-section={id}
                aria-pressed={id === section}
                onClick={() => setSection(id)}
              >
                <Icon name={icon} size={17} />
                <span>{l}</span>
              </button>
            ))}
          </nav>
          <div className="settings-main">
            <div className="settings-head">
              <h2>{title}</h2>
              <p>{subtitle}</p>
            </div>
            {groups ? (
              <div className="settings-tabs" aria-label={`Submenu ${title}`}>
                {groups.map(([id, l]) => (
                  <button
                    key={id}
                    type="button"
                    className="btn"
                    data-setting-group={id}
                    aria-pressed={id === key}
                    onClick={() => setGroup({ ...group, [section]: id })}
                  >
                    {l}
                  </button>
                ))}
              </div>
            ) : null}
            {DETAIL[section] ? <p className="settings-help settings-context">{DETAIL[section]}</p> : null}
            {!can('config.edit') && ['general', 'source', 'display', 'kpi'].includes(key) ? (
              <fieldset className="settings-readonly" disabled>
                {body}
              </fieldset>
            ) : (
              body
            )}
            {section === 'source' ? <SourcePreview /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiPreview() {
  const { kpi } = useConfig();
  return (
    <div id="settings-kpi-preview">
      <AchievementLegend t={kpi} />
    </div>
  );
}
