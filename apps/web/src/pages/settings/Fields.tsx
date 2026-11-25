// Port settingsField/settingsEditor/settingsRows/settingsList mockup (generik).
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from '../../lib/icons';
import { SITES, siteName } from '../../lib/sites';
import { validate, SPEC, type Field } from './spec';

export interface Lookups {
  readonly lines: readonly string[];
  readonly products: readonly (readonly [string, string])[];
  readonly roles?: readonly (readonly [string, string])[];
}

export function SettingField({
  field,
  record,
  section,
  lookups,
}: {
  readonly field: Field;
  readonly record: Record<string, unknown>;
  readonly section: string;
  readonly lookups: Lookups;
}) {
  const [key, label, type, optional, limit, max] = field;
  const value = record[key] ?? '';
  const id = `cfg-${key}`;
  let control: ReactNode;
  if (type === 'enum' || type === 'site' || type === 'product' || type === 'line') {
    const options: readonly (readonly [string, string])[] =
      type === 'enum'
        ? key === 'role' && lookups.roles
          ? lookups.roles
          : Array.isArray(limit)
            ? limit
            : []
        : type === 'site'
          ? SITES.map((s) => [s, siteName(s) + (s === 'internal' ? '' : ' · On Hold')] as const)
          : type === 'product'
            ? lookups.products
            : lookups.lines.map((l) => [l, l] as const);
    const empty =
      section === 'planning' && type === 'line'
        ? 'Seluruh lokasi'
        : section === 'alerts' || (section === 'users' && type === 'site')
          ? 'Semua lokasi'
          : `Pilih ${label.toLowerCase()}`;
    control = (
      <select id={id} name={key} defaultValue={String(value)} {...(optional ? {} : { required: true })}>
        {type === 'enum' ? null : <option value="">{empty}</option>}
        {type === 'product' && value && !options.some(([code]) => code === String(value)) ? (
          <option value={String(value)}>{String(value)}</option>
        ) : null}
        {options.map(([o, c]) => (
          <option key={o} value={o}>
            {c}
          </option>
        ))}
      </select>
    );
  } else if (type === 'bool') {
    control = <input id={id} name={key} type="checkbox" defaultChecked={value === true} />;
  } else {
    const inputType = ({ num: 'number', int: 'number', code: 'text', password: 'password' } as Record<string, string>)[type] ?? type;
    control = (
      <input
        id={id}
        name={key}
        type={inputType}
        defaultValue={type === 'password' ? '' : String(value)}
        {...(optional ? {} : { required: true })}
        {...(inputType === 'number' ? { min: Number(limit ?? 0), max: max ?? undefined, step: type === 'int' ? 1 : 'any' } : {})}
        {...(type === 'text' || type === 'code' ? { maxLength: type === 'code' ? 60 : 130 } : {})}
        {...(type === 'password' ? { autoComplete: 'new-password', maxLength: 200 } : {})}
      />
    );
  }
  return (
    <div className={`setting-field${type === 'bool' ? ' setting-check' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {control}
    </div>
  );
}

export function readForm(e: FormEvent<HTMLFormElement>, fields: readonly Field[]): Record<string, unknown> {
  const f = new FormData(e.currentTarget);
  const out: Record<string, unknown> = {};
  for (const [key, , type] of fields) out[key] = type === 'bool' ? f.get(key) === 'on' : String(f.get(key) ?? '');
  return out;
}

export function Editor({
  section,
  label,
  record,
  isList,
  lookups,
  onSave,
  onCancel,
  extra,
  fields,
}: {
  readonly section: string;
  readonly label: string;
  readonly record: Record<string, unknown>;
  readonly isList: boolean;
  readonly lookups: Lookups;
  readonly onSave: (value: Record<string, unknown>) => Promise<void> | void;
  readonly onCancel?: () => void;
  readonly extra?: ReactNode;
  readonly fields?: readonly Field[];
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const identity = record['id'];
  useEffect(() => {
    if (!isList) return;
    const trigger = document.activeElement;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'start' });
    return () => {
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [section, identity, isList]);
  const spec = fields ?? SPEC[section] ?? [];
  const submit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const raw = readForm(e, spec);
    const checked = fields ? { value: raw } : validate(section, raw);
    if (checked.error || !checked.value) {
      setError(checked.error ?? 'Data tidak valid.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave(checked.value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="settings-card settings-editor" id="settings-editor">
      {isList ? (
        <header>
          <h3 ref={heading} tabIndex={-1}>
            {record['id'] ? 'Edit ' : 'Tambah '}
            {label}
            {section === 'lines' && identity ? ` · ${String(identity)}` : ''}
          </h3>
          <button className="btn" type="button" onClick={onCancel}>
            Batal
          </button>
        </header>
      ) : null}
      <form id="settings-form" data-config={section} onSubmit={(e) => void submit(e)} key={String(record['id'] ?? section)}>
        <div className="settings-fields">
          {spec.map((f) => (
            <SettingField key={f[0]} field={f} record={record} section={section} lookups={lookups} />
          ))}
        </div>
        {extra}
        {error ? (
          <p className="settings-feedback" role="alert" data-error="">
            {error}
          </p>
        ) : null}
        <div className="settings-save">
          <button className="btn pri" type="submit" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan perubahan'}
          </button>
        </div>
      </form>
    </section>
  );
}

export interface ListRow {
  readonly id: string;
  readonly active: boolean;
  readonly title: string;
  readonly detail: readonly (string | null | undefined | false)[];
}

export function ListTable({
  label,
  rows,
  onNew,
  onEdit,
  onToggle,
  headerExtra,
  newLabel = 'Tambah',
  canToggle = true,
}: {
  readonly label: string;
  readonly rows: readonly ListRow[];
  readonly onNew?: () => void;
  readonly onEdit?: (id: string) => void;
  readonly onToggle?: (id: string) => void;
  readonly headerExtra?: ReactNode;
  readonly newLabel?: string;
  readonly canToggle?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const q = query.trim().toLocaleLowerCase('id-ID');
  const filtered = rows.filter((r) => [r.title, ...r.detail].join(' ').toLocaleLowerCase('id-ID').includes(q));
  const perPage = 14;
  const pageCount = Math.ceil(filtered.length / perPage);
  const p = Math.min(page, Math.max(0, pageCount - 1));
  const items = filtered.slice(p * perPage, (p + 1) * perPage);
  return (
    <section className="settings-card settings-list">
      <header>
        <div>
          <h3>{label}</h3>
          <p>{rows.filter((r) => r.active).length} aktif</p>
        </div>
        {headerExtra ??
          (onNew ? (
            <button className="btn pri" type="button" data-setting-new onClick={onNew}>
              <Icon name="plus" size={16} /> {newLabel}
            </button>
          ) : null)}
      </header>
      <label className="settings-search">
        <Icon name="search" size={15} />
        <input
          type="search"
          id="settings-search"
          placeholder={`Cari ${label.toLowerCase()}`}
          aria-label={`Cari ${label}`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </label>
      <div className="settings-table" id="settings-table">
        <table>
          <thead>
            <tr>
              <th scope="col">Nama</th>
              <th scope="col">Status</th>
              <th scope="col">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((r) => (
                <tr key={r.id}>
                  <th scope="row">
                    {r.title}
                    <small>{r.detail.filter(Boolean).join(' · ')}</small>
                  </th>
                  <td>
                    <span className={`settings-state${r.active ? ' active' : ''}`}>{r.active ? 'Aktif' : 'Nonaktif'}</span>
                  </td>
                  <td>
                    <div className="settings-row-actions">
                      {onEdit ? (
                        <button className="btn" type="button" aria-label={`Edit ${r.title}`} onClick={() => onEdit(r.id)}>
                          <Icon name="edit" size={14} /> Edit
                        </button>
                      ) : null}
                      {onToggle && canToggle ? (
                        <button
                          className="btn"
                          type="button"
                          aria-label={`${r.active ? 'Nonaktifkan' : 'Aktifkan'} ${r.title}`}
                          onClick={() => onToggle(r.id)}
                        >
                          {r.active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3}>Belum ada data yang cocok.</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="settings-list-foot">
          <span>{filtered.length} entri</span>
          {pageCount > 1 ? (
            <div>
              <button className="btn" type="button" aria-label="Halaman sebelumnya" disabled={!p} onClick={() => setPage(p - 1)}>
                <Icon name="back" size={15} />
              </button>
              <span>
                {p + 1} / {pageCount}
              </span>
              <button
                className="btn"
                type="button"
                aria-label="Halaman berikutnya"
                disabled={p + 1 >= pageCount}
                onClick={() => setPage(p + 1)}
              >
                <Icon name="next" size={15} />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
