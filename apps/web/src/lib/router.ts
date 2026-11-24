import { useEffect, useState } from 'react';

// Router hash, sama dengan mockup (#executive, #master-internal, #line-41hr121, ...).
export type Route =
  | { readonly page: 'executive' | 'hub' | 'monitoring-output' | 'lines' | 'export' | 'settings' }
  | { readonly page: 'master' | 'stoptime' | 'monitoring-output'; readonly site: string }
  | { readonly page: 'line'; readonly line: string };

const SITES = ['internal', 'sgp', 'systech'];

export function parseRoute(hash: string): Route {
  let r = hash.replace(/^#/, '') || 'executive';
  if (r === 'stoptime') r = 'stoptime-internal';
  r = r.replace(/^breakdown-(internal|sgp|systech)$/, 'monitoring-output-$1');
  const m = /^(master|monitoring-output|stoptime)-([a-z0-9_-]+)$/.exec(r);
  if (m && SITES.includes(m[2] ?? '')) return { page: m[1] as 'master' | 'stoptime' | 'monitoring-output', site: m[2] ?? '' };
  const lm = /^line-([a-z0-9_-]+)$/.exec(r);
  if (lm) return { page: 'line', line: (lm[1] ?? '').toUpperCase() };
  if (r === 'hub' || r === 'monitoring-output' || r === 'lines' || r === 'export' || r === 'settings') return { page: r };
  return { page: 'executive' };
}

/** Redirect URL lama dashboard (?view=master|hub|breakdown&tempat=&line=) ke hash baru agar bookmark tidak mati. */
export function legacyRedirect(search: string): string | null {
  const q = new URLSearchParams(search);
  const view = q.get('view');
  if (!view) return null;
  const site = (q.get('tempat') ?? q.get('source') ?? 'internal').toLowerCase();
  const line = q.get('line');
  if (line) return `#line-${line.toLowerCase()}`;
  if (view === 'hub') return '#hub';
  if (view === 'master') return `#master-${SITES.includes(site) ? site : 'internal'}`;
  if (view === 'breakdown') return `#monitoring-output-${SITES.includes(site) ? site : 'internal'}`;
  return '#executive';
}

export function useRoute(): Route {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = (): void => setHash(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return parseRoute(hash);
}
