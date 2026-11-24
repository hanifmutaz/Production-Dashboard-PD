// Port pickHtml/pkPop/pkMonth mockup: pemilih tanggal tunggal (day) & rentang (range).
import { useEffect, useRef, useState } from 'react';
import { addD, addM, MIN_D, MIN_M, pad, presetRange, type Range } from '../lib/dates';
import { fd, MON } from '../lib/format';
import { Icon } from '../lib/icons';

const RANGE_PRESETS: readonly [string, string][] = [
  ['today', 'Hari ini'],
  ['yday', 'Kemarin'],
  ['7d', '7 hari terakhir'],
  ['14d', '14 hari terakhir'],
  ['30d', '30 hari terakhir'],
  ['90d', '90 hari terakhir'],
  ['mtd', 'Bulan ini'],
  ['lm', 'Bulan lalu'],
  ['ytd', 'Tahun ini'],
];

const monthLabel = (vm: string): string => `${MON[Number(vm.slice(5, 7)) - 1] ?? ''} ${vm.slice(0, 4)}`;
const dayCount = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5) + 1;

export function rangeLabel(r: Range): string {
  if (r.f === r.t) return fd(r.f);
  const a = r.f.split('-');
  const b = r.t.split('-');
  return a[0] === b[0] && a[1] === b[1] ? `${Number(a[2])} sampai ${fd(r.t)}` : `${fd(r.f)} sampai ${fd(r.t)}`;
}

function Month({
  vm,
  a,
  b,
  today,
  onPick,
}: {
  readonly vm: string;
  readonly a: string;
  readonly b: string;
  readonly today: string;
  readonly onPick: (iso: string) => void;
}) {
  const y = Number(vm.slice(0, 4));
  const m = Number(vm.slice(5, 7));
  const off = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return (
    <div className="pkc">
      <div className="pkg">
        {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((w) => (
          <span className="pkw" key={w}>
            {w}
          </span>
        ))}
        {Array.from({ length: off }, (_, i) => (
          <span key={`o${i}`}></span>
        ))}
        {Array.from({ length: n }, (_, i) => {
          const iso = `${vm}-${pad(i + 1)}`;
          const ed = iso === a || iso === b;
          return (
            <button
              key={iso}
              type="button"
              className={`pkd${iso >= a && iso <= b ? ' in' : ''}${ed ? ' ed' : ''}${iso === today ? ' td' : ''}`}
              data-pk-day={iso}
              aria-label={fd(iso)}
              aria-pressed={ed}
              disabled={iso > today || iso < MIN_D}
              onClick={() => onPick(iso)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Nav({ vm, today, setVm }: { readonly vm: string; readonly today: string; readonly setVm: (v: string) => void }) {
  return (
    <div className="pkh">
      <button type="button" className="ib pkn" aria-label="Bulan sebelumnya" disabled={vm <= MIN_M} onClick={() => setVm(addM(vm, -1))}>
        <Icon name="back" size={16} />
      </button>
      <b aria-live="polite">{monthLabel(vm)}</b>
      <button
        type="button"
        className="ib pkn"
        aria-label="Bulan berikutnya"
        disabled={vm >= today.slice(0, 7)}
        onClick={() => setVm(addM(vm, 1))}
      >
        <Icon name="next" size={16} />
      </button>
    </div>
  );
}

function usePopover(): [boolean, (v: boolean) => void, React.RefObject<HTMLDivElement | null>] {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return [open, setOpen, ref];
}

export function DayPicker({
  value,
  today,
  onChange,
}: {
  readonly value: string;
  readonly today: string;
  readonly onChange: (iso: string) => void;
}) {
  const [open, setOpen, ref] = usePopover();
  const [vm, setVm] = useState(value.slice(0, 7));
  const shortcuts: [string, string, number][] = [
    ['today', 'Hari ini', 0],
    ['yday', 'Kemarin', -1],
    ['2d', '2 hari lalu', -2],
    ['wk', 'Seminggu lalu', -7],
  ];
  const active = shortcuts.find(([, , n]) => addD(today, n) === value)?.[0] ?? 'custom';
  const pick = (iso: string): void => {
    onChange(iso);
    setOpen(false);
  };
  return (
    <div className="pk" data-pk="day" ref={ref}>
      <button
        className="btn"
        type="button"
        aria-label="Hari sebelumnya"
        disabled={value <= MIN_D}
        onClick={() => onChange(addD(value, -1))}
      >
        <Icon name="back" size={16} />
      </button>
      <button
        className="btn pkb"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setVm(value.slice(0, 7));
          setOpen(!open);
        }}
      >
        <Icon name="cal" size={16} />
        <span>{fd(value)}</span>
        <Icon name="chev" size={14} />
      </button>
      <button className="btn" type="button" aria-label="Hari berikutnya" disabled={value >= today} onClick={() => onChange(addD(value, 1))}>
        <Icon name="next" size={16} />
      </button>
      {open ? (
        <div className="pkp pk-compact pk-day" role="dialog" aria-label="Pilih tanggal" tabIndex={-1}>
          <label className="pk-preset">
            Pilihan cepat
            <select
              value={active}
              onChange={(e) => {
                const s = shortcuts.find(([k]) => k === e.target.value);
                if (s) pick(addD(today, s[2]));
              }}
            >
              <option value="custom">Pilih tanggal sendiri</option>
              {shortcuts.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <div className="pk-calendar">
            <Nav vm={vm} today={today} setVm={setVm} />
            <Month vm={vm} a={value} b={value} today={today} onPick={pick} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RangePicker({
  value,
  today,
  onChange,
  wide,
}: {
  readonly value: Range;
  readonly today: string;
  readonly onChange: (r: Range) => void;
  readonly wide?: boolean;
}) {
  const [open, setOpen, ref] = usePopover();
  const [draft, setDraft] = useState({
    a: value.f,
    b: value.t as string | null,
    pend: false,
    vm: value.t.slice(0, 7),
    quick: value.p,
    n: 10,
  });
  const start = (): void => {
    const custom = /^(\d+)d$/.exec(value.p);
    const known = RANGE_PRESETS.some(([k]) => k === value.p);
    setDraft({
      a: value.f,
      b: value.t,
      pend: false,
      vm: value.t.slice(0, 7),
      quick: custom && !known ? 'last' : value.p,
      n: custom ? Number(custom[1]) : 10,
    });
    setOpen(!open);
  };
  const commit = (r: Range): void => {
    onChange(r);
    setOpen(false);
  };
  const end = draft.b ?? draft.a;
  return (
    <div className={`pk${wide ? ' l' : ''}`} data-pk="rng" ref={ref}>
      <button className="btn pkb" type="button" aria-haspopup="dialog" aria-expanded={open} onClick={start}>
        <Icon name="cal" size={16} />
        <span>
          {rangeLabel(value)} ({dayCount(value.f, value.t)} hari)
        </span>
        <Icon name="chev" size={14} />
      </button>
      {open ? (
        <div className="pkp pk-compact pk-range" role="dialog" aria-label="Pilih periode" tabIndex={-1}>
          <label className="pk-preset">
            Periode cepat
            <select
              value={draft.quick}
              onChange={(e) => {
                const k = e.target.value;
                if (k === 'last' || k === 'manual' || k === 'custom') setDraft({ ...draft, quick: k });
                else commit(presetRange(k, today));
              }}
            >
              <option value="manual">Pilih tanggal sendiri</option>
              {draft.quick === 'custom' ? <option value="custom">Rentang khusus</option> : null}
              {RANGE_PRESETS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
              <option value="last">Jumlah hari terakhir…</option>
            </select>
          </label>
          <div className="pk-range-quick" hidden={draft.quick !== 'last'}>
            <label htmlFor="pk-n">Jumlah hari terakhir</label>
            <input
              type="number"
              id="pk-n"
              min="1"
              max="366"
              value={draft.n}
              onChange={(e) => setDraft({ ...draft, n: Number(e.target.value) })}
            />
            <button
              className="btn"
              type="button"
              disabled={!(draft.n >= 1 && draft.n <= 366)}
              onClick={() => commit(presetRange(`${draft.n}d`, today))}
            >
              Gunakan
            </button>
          </div>
          <div className="pkin">
            <label>
              Dari
              <input
                type="date"
                value={draft.a}
                min={MIN_D}
                max={today}
                onChange={(e) => e.target.value && setDraft({ ...draft, a: e.target.value, quick: 'manual' })}
              />
            </label>
            <label>
              Sampai
              <input
                type="date"
                value={end}
                min={MIN_D}
                max={today}
                onChange={(e) => e.target.value && setDraft({ ...draft, b: e.target.value, pend: false, quick: 'manual' })}
              />
            </label>
          </div>
          <div className="pk-calendar">
            <Nav vm={draft.vm} today={today} setVm={(vm) => setDraft({ ...draft, vm })} />
            <Month
              vm={draft.vm}
              a={draft.a}
              b={end}
              today={today}
              onPick={(iso) => {
                if (!draft.pend) setDraft({ ...draft, a: iso, b: null, pend: true, quick: 'manual' });
                else if (iso < draft.a) setDraft({ ...draft, a: iso, b: draft.a, pend: false });
                else setDraft({ ...draft, b: iso, pend: false });
              }}
            />
          </div>
          <div className="pkf">
            <output className="pk-range-count">{draft.pend ? 'Pilih tanggal akhir' : `${dayCount(draft.a, end)} hari`}</output>
            <button className="btn" type="button" onClick={() => setOpen(false)}>
              Batal
            </button>
            <button
              className="btn pri"
              type="button"
              disabled={draft.pend || draft.a > end || dayCount(draft.a, end) > 366}
              onClick={() => commit({ f: draft.a, t: end, p: 'custom' })}
            >
              Terapkan
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
