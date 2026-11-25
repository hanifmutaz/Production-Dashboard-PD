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

function routeKey(r: Route): string {
  return 'site' in r ? `${r.page}-${r.site}` : r.page === 'line' ? `line-${r.line.toLowerCase()}` : r.page;
}

export function App() {
  const { me, loading, allowed, can } = useAuth();
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
      <main id="view" className="department-tv" key={`${me.screen}-${me.today}`}>
        <h1>{me.screen === 'hub' ? 'Master Dashboard Utama' : 'Executive Dashboard'}</h1>
        {me.screen === 'hub' ? <Hub /> : <Executive />}
      </main>
    );
  }
  if (me.kind === 'device') route = { page: 'line', line: me.line ?? '' };
  else if (!allowed(routeKey(route)) || (route.page === 'export' && !can('export.run'))) {
    // Urutan menu mengikuti daftar menu mockup (bukan urutan abjad dari server).
    const order = MENU_OPTIONS.map(([k]) => k);
    const first = [...me.menus].sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? 'executive';
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
