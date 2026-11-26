import { useEffect, useState } from 'react';
import { Shell } from './shell/Shell';
import { useAuth } from './lib/auth';
import { useConfig } from './lib/kpi';
import { useRoute, type Route } from './lib/router';
import { Executive } from './pages/Executive';
import { Export } from './pages/Export';
import { Hub } from './pages/Hub';
import { LineDetail } from './pages/LineDetail';
import { Lines } from './pages/Lines';
import { Login } from './pages/Login';
import { Master } from './pages/Master';
import { Monitoring } from './pages/Monitoring';
import { Settings } from './pages/settings/Settings';
import { Stoptime } from './pages/Stoptime';
import { MENU_OPTIONS } from './pages/settings/spec';
import { TvAutoScroll } from './components/TvAutoScroll';

function routeKey(r: Route): string {
  return 'site' in r ? `${r.page}-${r.site}` : r.page === 'line' ? `line-${r.line.toLowerCase()}` : r.page;
}

const WIB_TIME = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const WIB_DATE = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Header layar TV Departemen: judul besar terbaca dari jauh + jam WIB + status perangkat. */
function TvHeader({ title, device }: { readonly title: string; readonly device: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <header className="tv-head">
      <div className="tv-head-title">
        <span className="tv-eyebrow">Hirose Internal · TV Departemen</span>
        <h1>{title}</h1>
      </div>
      <div className="tv-head-meta">
        <time className="tv-clock" dateTime={now.toISOString()}>
          {WIB_TIME.format(now).replace(/\./g, ':')}
          <small>WIB</small>
        </time>
        <span className="tv-date">{WIB_DATE.format(now)}</span>
        <span className="tv-device" title="Perangkat ini terhubung">
          <i aria-hidden="true" />
          {device}
        </span>
      </div>
    </header>
  );
}

export function App() {
  const { me, loading, allowed, logout } = useAuth();
  const { raw } = useConfig();
  const parsed = useRoute();
  if (loading) return null;
  if (!me) return <Login />;

  // Halaman awal dari Settings → Tampilan bila hash kosong.
  let route = parsed;
  const home = String((raw.get('config.display')?.value as { home?: string } | undefined)?.home ?? 'executive');
  if (!location.hash && ['hub', 'monitoring-output'].includes(home)) route = { page: home as 'hub' };
  // Perangkat kiosk hanya melihat line miliknya (port allowedRoute + pairedDevice).
  if (me.kind === 'device' && (me.screen === 'hub' || me.screen === 'executive')) {
    return (
      <main id="view" className="department-tv" data-tv={me.screen} key={`${me.screen}-${me.today}`}>
        <TvHeader title={me.screen === 'hub' ? 'Master Dashboard Utama' : 'Executive Dashboard'} device={me.name} />
        <TvAutoScroll />
        {me.screen === 'hub' ? <Hub /> : <Executive />}
      </main>
    );
  }
  if (me.kind === 'device') route = { page: 'line', line: me.line ?? '' };
  else if (!allowed(routeKey(route))) {
    // Urutan menu mengikuti daftar menu mockup (bukan urutan abjad dari server).
    const order = MENU_OPTIONS.map(([k]) => k);
    const first = order.find((key) => key !== 'line' && allowed(key));
    if (!first)
      return (
        <main className="page">
          <p>Role ini belum memiliki halaman awal yang dapat diakses.</p>
          <button className="btn" onClick={() => void logout()}>
            Keluar
          </button>
        </main>
      );
    route =
      first === 'master' || first === 'stoptime'
        ? { page: first, site: 'internal' }
        : ['executive', 'hub', 'monitoring-output', 'lines', 'export', 'settings'].includes(first)
          ? { page: first as 'hub' }
          : { page: 'executive' };
  }

  let page;
  switch (route.page) {
    case 'executive':
      page = <Executive />;
      break;
    case 'hub':
      page = <Hub />;
      break;
    case 'master':
      page = <Master key={routeKey(route)} site={'site' in route ? route.site : 'internal'} />;
      break;
    case 'stoptime':
      page = <Stoptime key={routeKey(route)} site={'site' in route ? route.site : 'internal'} />;
      break;
    case 'monitoring-output':
      page = <Monitoring site={'site' in route ? route.site : 'all'} />;
      break;
    case 'lines':
      page = <Lines />;
      break;
    case 'line':
      return me.kind === 'device' ? (
        <LineDetail line={route.line} />
      ) : (
        <Shell route={route}>{<LineDetail key={route.line} line={route.line} />}</Shell>
      );
    case 'export':
      page = <Export />;
      break;
    case 'settings':
      page = <Settings />;
      break;
  }
  return (
    <Shell route={route} key={undefined}>
      {page}
    </Shell>
  );
}
