import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { useConfig } from '../lib/kpi';
import { Icon } from '../lib/icons';
import type { Route } from '../lib/router';
import { SITES, siteName } from '../lib/sites';
import { isDarkTheme, toggleTheme } from '../lib/theme';

// Port DOM shell mockup: aside.side (#nav, #settings-dock), header.mbar.global-bar, main#view.
const PAGE_HEADINGS: Readonly<Record<string, readonly [string, string]>> = {
  executive: ['Executive Performance Dashboard', 'Overview'],
  hub: ['Master Dashboard Utama', 'Overview'],
  master: ['Master Dashboard', 'Lokasi'],
  stoptime: ['Stoptime', 'Lokasi'],
  'monitoring-output': ['Monitoring Output per Line', 'Produksi'],
  lines: ['Pilih Line', 'Produksi'],
  line: ['Detail Line', 'Produksi'],
  export: ['Export Data', 'Data'],
  settings: ['Settings', 'Administrasi'],
};

interface NavItem {
  readonly id: string;
  readonly t: string;
  readonly ic: string;
}

const NAV: readonly { readonly g: string; readonly i: readonly NavItem[] }[] = [
  {
    g: 'Overview',
    i: [
      { id: 'executive', t: 'Executive Dashboard', ic: 'chart' },
      { id: 'hub', t: 'Master Hub', ic: 'grid' },
    ],
  },
  { g: 'Lokasi', i: [] },
  {
    g: 'Produksi',
    i: [
      { id: 'monitoring-output', t: 'Monitoring Output per Line', ic: 'table' },
      { id: 'lines', t: 'Pilih Line', ic: 'lines' },
    ],
  },
  { g: 'Data', i: [{ id: 'export', t: 'Export Data', ic: 'dl' }] },
];

function routeId(route: Route): string {
  if ('site' in route) return `${route.page === 'monitoring-output' ? 'monitoring-output' : route.page}-${route.site}`;
  if (route.page === 'line') return 'line';
  return route.page;
}

function readRail(): boolean {
  try {
    return localStorage.getItem('cmRail') !== '0';
  } catch {
    return true;
  }
}

function Item({ c, current }: { readonly c: NavItem; readonly current: string }) {
  const { allowed } = useAuth();
  if (!allowed(c.id)) return null;
  return (
    <a className="it" href={`#${c.id}`} title={c.t} aria-label={c.t} {...(c.id === current ? { 'aria-current': 'page' as const } : {})}>
      <Icon name={c.ic} />
      <span className="lbl">{c.t}</span>
    </a>
  );
}

export function Shell({ route, children }: { readonly route: Route; readonly children: ReactNode }) {
  const { me, can, logout, allowed } = useAuth();
  const { name: appName, department } = useConfig();
  const [rail, setRail] = useState(readRail);
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    'site' in route && route.page !== 'monitoring-output' ? { [route.site]: true } : {},
  );
  const [drawer, setDrawer] = useState(false);
  const [dark, setDark] = useState(isDarkTheme);
  const [full, setFull] = useState(false);
  const viewRef = useRef<HTMLElement>(null);
  const current = route.page === 'monitoring-output' ? 'monitoring-output' : routeId(route);
  const [title, group] = PAGE_HEADINGS[route.page] ?? ['', ''];
  const context =
    'site' in route && route.page !== 'monitoring-output'
      ? siteName(route.site)
      : route.page === 'line'
        ? route.line
        : route.page === 'settings' && !can('config.edit')
          ? 'Akses lihat'
          : group;

  useEffect(() => {
    document.title = `${appName} · ${title}${'site' in route || route.page === 'line' ? ` · ${context}` : ''}`;
    setDrawer(false);
  }, [title, context, route, appName]);

  useEffect(() => {
    const on = (): void => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const saveRail = (v: boolean): void => {
    setRail(v);
    try {
      localStorage.setItem('cmRail', v ? '1' : '0');
    } catch {
      /* abaikan */
    }
  };

  const onGroup = (k: string): void => {
    if (rail && matchMedia('(min-width:1024px)').matches) {
      saveRail(false);
      setOpen({ [k]: true });
    } else setOpen(open[k] ? {} : { [k]: true });
  };

  const railLabel = rail ? 'Perluas sidebar' : 'Ciutkan sidebar';
  const themeLabel = dark ? 'Mode terang' : 'Mode gelap';
  const fullLabel = full ? 'Keluar layar penuh' : 'Layar penuh';
  const settingsLink = <Item c={{ id: 'settings', t: 'Settings', ic: 'settings' }} current={current} />;

  return (
    <div className={`app${rail ? ' rail' : ''}${drawer ? ' open' : ''}`} id="app">
      <aside className="side" id="side" aria-label="Sidebar">
        <div className="brand">
          <div className="logo" role="img" aria-label="Logo Hirose"></div>
          <div className="bt">
            <b>{appName}</b>
            <small>{department}</small>
          </div>
          <button
            className="ib sidebar-toggle"
            type="button"
            id="collapse"
            aria-label={railLabel}
            title={railLabel}
            aria-controls="side"
            aria-expanded={!rail}
            onClick={() => saveRail(!rail)}
          >
            <Icon name={rail ? 'panelOpen' : 'panel'} />
          </button>
          <button className="ib drawer-close" type="button" id="drawer-close" aria-label="Tutup sidebar" onClick={() => setDrawer(false)}>
            <Icon name="close" />
          </button>
        </div>
        <nav id="nav" aria-label="Menu utama">
          {NAV.map((g) => {
            if (g.g === 'Data' && !can('export.run')) return null;
            return [
              <div className="g" key={`${g.g}-h`}>
                {g.g}
              </div>,
              <div className="grp" key={`${g.g}-g`}>
                {g.g === 'Lokasi'
                  ? SITES.map((k) => {
                      if (!allowed(`master-${k}`) && !allowed(`stoptime-${k}`)) return null;
                      const ch: NavItem[] = [
                        { id: `master-${k}`, t: 'Master Dashboard', ic: 'gauge' },
                        { id: `stoptime-${k}`, t: 'Stoptime', ic: 'clock' },
                      ];
                      const on = ch.some((c) => c.id === current);
                      const op = Boolean(open[k]);
                      return [
                        <button
                          key={k}
                          className={`it${on && (!op || rail) ? ' cur' : ''}`}
                          type="button"
                          data-g={k}
                          aria-expanded={op}
                          title={siteName(k)}
                          aria-label={siteName(k)}
                          onClick={() => onGroup(k)}
                        >
                          <Icon name="bld" />
                          <span className="lbl">{siteName(k)}</span>
                          <span className={`chv${op ? ' up' : ''} lbl`}>
                            <Icon name="chev" size={16} />
                          </span>
                        </button>,
                        op ? (
                          <div className="sub" key={`${k}-sub`}>
                            {ch.map((c) => (
                              <Item key={c.id} c={c} current={current} />
                            ))}
                          </div>
                        ) : null,
                      ];
                    })
                  : g.i.map((c) => <Item key={c.id} c={c} current={current} />)}
              </div>,
            ];
          })}
        </nav>
        <nav id="settings-dock" className="foot" aria-label="Pengaturan">
          {settingsLink}
        </nav>
      </aside>
      <div className="scrim" id="scrim" aria-hidden="true" onClick={() => setDrawer(false)}></div>
      <div className="main">
        <header className="mbar global-bar">
          <button
            className="ib"
            id="burger"
            type="button"
            aria-label={drawer ? 'Tutup menu' : 'Buka menu'}
            aria-controls="side"
            aria-expanded={drawer}
            onClick={() => setDrawer(!drawer)}
          >
            <Icon name="menu" />
          </button>
          <div className="menu-heading">
            <h1 id="page-title">{title}</h1>
            <small id="page-context">{context}</small>
          </div>
          <div className="global-controls" id="global-controls" {...(drawer ? { inert: true } : {})}>
            <button
              className="ib"
              id="theme"
              type="button"
              title={themeLabel}
              aria-label={`Ganti ke ${themeLabel.toLowerCase()}`}
              onClick={() => {
                toggleTheme();
                setDark(isDarkTheme());
              }}
            >
              <Icon name={dark ? 'sun' : 'moon'} />
            </button>
            <button
              className="ib"
              id="fullscreen"
              type="button"
              title={fullLabel}
              aria-label={fullLabel}
              aria-pressed={full}
              onClick={() => {
                const req = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
                void req.catch(() => undefined);
              }}
            >
              <Icon name={full ? 'restore' : 'full'} />
            </button>
            <details className="profile" id="profile">
              <summary id="profile-trigger" aria-label={`Profil ${me?.role ?? ''}`}>
                <Icon name="user" size={17} />
                <span>{me?.name ?? ''}</span>
                <Icon name="chev" size={13} />
              </summary>
              <div className="profile-options">
                <p id="profile-description">
                  {me?.name} · {me?.role}
                </p>
                <div id="profile-settings">{settingsLink}</div>
                <button type="button" className="it" id="demo-logout" onClick={() => void logout()}>
                  Keluar
                </button>
              </div>
            </details>
          </div>
          <div id="header-note" role="status"></div>
        </header>
        <main id="view" aria-labelledby="page-title" tabIndex={-1} ref={viewRef} {...(drawer ? { inert: true } : {})}>
          {children}
        </main>
      </div>
    </div>
  );
}
