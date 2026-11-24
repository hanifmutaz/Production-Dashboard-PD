import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { fd, MON } from '../lib/format';
import { siteName } from '../lib/sites';

// Port dialog #work-calendar mockup. Tipe hari: work | holiday | overtime (akhir pekan yang dijadikan hari kerja).
type DayType = 'work' | 'holiday' | 'overtime';
const LABELS: Readonly<Record<DayType, string>> = { work: 'Hari kerja', holiday: 'Libur', overtime: 'Lembur' };

function monthDates(year: number, month: number): string[] {
  const n = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
}
const isWeekend = (iso: string): boolean => {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
};

export interface WorkCalendarProps {
  readonly site: string;
  readonly year: number;
  readonly month: number;
  readonly onClose: (saved: boolean) => void;
}

export function WorkCalendar({ site, year, month, onClose }: WorkCalendarProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [base, setBase] = useState<{ holidays: Set<string>; version: number | null } | null>(null);
  const [changes, setChanges] = useState<Map<string, DayType>>(new Map());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
    api
      .get<{ holidays: string[]; version: number | null }>(`/api/v3/executive/calendar?tempat=${site}&year=${year}&month=${month}`)
      .then((r) => setBase({ holidays: new Set(r.data?.holidays ?? []), version: r.data?.version ?? null }))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Kalender gagal dimuat.'));
  }, [site, year, month]);

  const dates = monthDates(year, month);
  const original = (d: string): DayType => (base?.holidays.has(d) ? 'holiday' : isWeekend(d) ? 'overtime' : 'work');
  const typeOf = (d: string): DayType => changes.get(d) ?? original(d);
  const working = dates.filter((d) => typeOf(d) !== 'holiday').length;
  const offset = (new Date(`${dates[0] ?? ''}T00:00:00Z`).getUTCDay() + 6) % 7;

  const toggle = (d: string): void => {
    const orig = original(d);
    const selected: DayType = typeOf(d) === 'holiday' ? (isWeekend(d) ? 'overtime' : 'work') : 'holiday';
    const next = new Map(changes);
    if (selected === orig) next.delete(d);
    else next.set(d, selected);
    setChanges(next);
  };

  const save = async (): Promise<void> => {
    if (!base || changes.size === 0 || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.put('/api/v3/executive/calendar', {
        year,
        month,
        tempat: site,
        holidays: dates.filter((d) => typeOf(d) === 'holiday'),
        ...(base.version !== null ? { version: base.version } : {}),
      });
      ref.current?.close();
      onClose(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Kalender gagal disimpan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog id="work-calendar" className="work-calendar" aria-labelledby="work-calendar-title" ref={ref} onClose={() => onClose(false)}>
      <header>
        <div>
          <h2 id="work-calendar-title">Kalender Kerja</h2>
          <p id="work-calendar-context">
            {siteName(site)} · {MON[month - 1]} {year}
          </p>
          <p>Klik tanggal libur. Klik lagi untuk menjadikannya hari kerja.</p>
        </div>
        <form method="dialog">
          <button type="submit" className="btn" aria-label="Tutup kalender kerja">
            Tutup
          </button>
        </form>
      </header>
      <form
        id="work-calendar-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p id="work-calendar-total" role="status">
          {base ? `${working} hari kerja · ${dates.length - working} hari libur` : 'Memuat…'}
        </p>
        <div id="work-calendar-grid">
          {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((l) => (
            <span key={l}>{l}</span>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <span key={`o${i}`}></span>
          ))}
          {base
            ? dates.map((d) => {
                const t = typeOf(d);
                return (
                  <button
                    key={d}
                    type="button"
                    className="work-date"
                    data-work-date={d}
                    data-type={t}
                    aria-pressed={t === 'holiday'}
                    aria-label={`${fd(d)} · ${LABELS[t]}`}
                    onClick={() => toggle(d)}
                  >
                    <b>{Number(d.slice(8))}</b>
                    <small>{LABELS[t]}</small>
                  </button>
                );
              })
            : null}
        </div>
        <p id="work-calendar-error" role="alert">
          {error}
        </p>
        <footer>
          <button type="button" className="btn" id="work-calendar-reset" hidden={changes.size === 0} onClick={() => setChanges(new Map())}>
            Urungkan pilihan
          </button>
          <button className="btn pri" type="submit" id="work-calendar-save" disabled={changes.size === 0 || busy}>
            Simpan kalender
          </button>
        </footer>
      </form>
    </dialog>
  );
}
