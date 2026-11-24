"""Uji paritas tampilan V3 vs mockup (npm run test:e2e).

Membandingkan COMPUTED STYLE elemen kunci (font, warna, border, radius, padding, display, gap) antara
mockup HTML dan aplikasi V3 yang sedang jalan. Bukan pixel diff: data V3 (API) beda dari dummy mockup,
jadi ukuran/posisi & warna band pencapaian sengaja tidak dibandingkan. Screenshot disimpan untuk cek mata.

Prasyarat: Python + playwright, Chromium (env CHROME_PATH opsional), server V3 jalan (npm run dev:mem),
login admin/admin12345 (dev:mem). Env BASE_URL default http://localhost:3100/.
"""
import json, os, pathlib, re, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
MOCK = (ROOT / 'docs/mockup/Dashboard-Produksi-Hirose-Industrial-Velvet-DMSans-Fix.html').as_uri()
BASE = os.environ.get('BASE_URL', 'http://localhost:3100/')
OUT = ROOT / 'test-results' / 'parity'
STYLE = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'border-top', 'border-radius', 'padding', 'display', 'gap', 'background-color']
# Halaman yang sudah di-port: (rute mockup, rute V3) -> selector. Prefix "~" = warna/latar tidak dibandingkan
# (bergantung data, mis. band pencapaian). Prefix "$" = elemen di dalam shadow DOM <production-monitoring>.
PAGES = {
    'hub': ['.hub-tabs', '.hub-tab[aria-selected="true"]', '.hub-period-picker .pkb', '.hub-kpis .card', '.hub-kpis .kl', '~.hub-kpis .kv', '.hub-output-trend h2', '.hub-trend-legend', '.hub-comparison-label', '~.hub-comparison-track', '.card.np h2', '.tw th', '~.tw td', '.chip.ok', '.hub-location', '.achievement-legend span'],
    'master-internal': ['.page-lead', '.tabs .lt', '.lt[aria-current] b', '.master-monthly', '.master-frame-head h2', '.master-stat', '.master-stat .kl', '~.master-stat strong', '.master-chart-card h2', '.master-step .btn', '.master-chart-summary', '.master-trend-plot text', '.m4', '.m4 span', '.master-loss-head .btn', '.master-rank-head h2', '.master-rank-grid .card', '.master-line-table .chip', '#msel', '#q', '.master-line-table th', '~.master-line-table td'],
    'stoptime-internal': ['.tabs .lt', '.kpis .card', '.kpis .kl', '~.kpis .kv', '.row .card h2', '.m4 span', '.m4 .tk', '.chip.b', '.chip.b[aria-pressed="true"]', '.tw th', '~.tw td'],
    'lines': ['.lg', '.lc', '.lc b', '.lc span', '.lc .sh'],
    'export': ['.export-presets h2', '#x-template', '.export-filters .chip', '.export-filters .pkb', '#x-aggregation', '#x-lines', '.export-section-head .btn', '.export-column-summary', '#x-format', '#x-name', '#xpv .stp h2', '.sumv dt', '.sumv dd', '.pvt th', '~.pvt td', '.export-actions .btn.pri'],
    'settings': ['.settings-intro p', '.settings-nav-button', '.settings-nav-button[aria-pressed="true"]', '.settings-head h2', '.settings-head p', '.settings-editor', '.setting-field label', '.setting-field input', '.settings-save .btn'],
    'monitoring-output': ['$.top', '$.cutoff', '$#meeting', '$.summary-heading', '$.kpi', '$.kpi-label', '~$.kpi-value', '$.module-head h2', '$.site-kpi-table th', '~$.site-kpi-table td', '$#status', '$.location-tab[aria-selected="true"]', '$.matrix th', '$.line-pick', '~$.cell-pick', '$.matrix-foot', '$.date-nav output', '$.detail .section-title h2', '$.tabbar .tab'],
    'line': ['.lnh', '.lnb', '.clk small', '.ttl', '.sub2', '.lctl .shs button', '.lcode', '~.ps', '.kv2 span', '.lt2', '.av88', '.mc small', '~.mc .mv b', '.av small', '.eh', '.ec small', '.ht th', '~.ht td', '~.qs b'],
    'executive': ['#side', '.brand', '#collapse', '#nav .g', '#nav .it[aria-current]', '#nav button.it', '#settings-dock .it', '.global-bar', '#page-title', '#page-context', '#theme', '#profile-trigger', '.exec-head', '#mo', '#yr', '.exec-summary', '.exec-spotlight', '.exec-spotlight h2', '.exec-spotlight-value', '.exec-spotlight p', '.exec-stats > div', '.exec-stats dt', '.exec-stats dd strong', '.exec-stats dd small', '.exec-panel', '.exec-panel-head h2', '.exec-date-note', '.exec-locations thead th', '.exec-location-name', '.exec-workdays', '.exec-edit', '.exec-actual strong', '.exec-target-pair dt', '.exec-target-pair dd', '.exec-progress-caption', '.exec-table-key', '.achievement-legend span'],
}
LOGIN = ['.login-visual', '.login-brand', '.login-card', '.login-title', '.login-toolbar', '#login-theme', '#demo-enter', '#pair-form input', '#pair-form .btn', '.login-notice']
GRAB = """([sels,props])=>Object.fromEntries(sels.map(s=>{const raw=s.replace(/^~/,'');const shadow=raw.startsWith('$');const q=raw.replace(/^\\$/,'');
const root=shadow?document.querySelector('production-monitoring')?.shadowRoot:document;const e=root?root.querySelector(q):null;if(!e)return [s,null];
const c=getComputedStyle(e);return [s,Object.fromEntries(props.map(p=>[p,c.getPropertyValue(p)]))]}))"""
COLOR = {'background-color', 'color'}
# Rute mockup bila beda dengan V3 (kiosk line memakai line fixture yang berbeda).
MOCK_ROUTE = {'line': 'line-41hr121'}
V3_ROUTE = {'line': 'line-dev-l01'}


def compare(a, b, sels):
    bad = []
    for s in sels:
        if a.get(s) is None or b.get(s) is None:
            bad.append(f'{s}: hilang (mock={a.get(s) is not None}, v3={b.get(s) is not None})')
            continue
        strip = (lambda v: re.sub(r'rgba?\([^)]*\)', '', v)) if s.startswith('~') else (lambda v: v)
        d = [f'{k}: {a[s][k]!r} -> {b[s][k]!r}' for k in STYLE if strip(a[s][k]) != strip(b[s][k]) and not (s.startswith('~') and k in COLOR)]
        if d:
            bad.append(f'{s}: ' + '; '.join(d))
    return bad


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    failures = []
    with sync_playwright() as p:
        kw = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}
        br = p.chromium.launch(**kw)
        for theme in ('light', 'dark'):
            for width in (1440, 1024, 390):
                m = br.new_page(viewport={'width': width, 'height': 900}, color_scheme=theme)
                v = br.new_page(viewport={'width': width, 'height': 900}, color_scheme=theme)
                m.goto(MOCK); m.wait_for_timeout(600)
                v.goto(BASE); v.wait_for_timeout(900)
                tag = f'login-{theme}-{width}'
                failures += [f'[{tag}] {x}' for x in compare(m.evaluate(GRAB, [LOGIN, STYLE]), v.evaluate(GRAB, [LOGIN, STYLE]), LOGIN)
                             if not x.startswith('#demo-enter')]  # tombol login sengaja beda (role demo → username/password)
                v.screenshot(path=str(OUT / f'v3-{tag}.png'))
                m.check('input[value=admin]'); m.click('#demo-enter'); m.wait_for_timeout(600)
                v.fill('input[name=username]', 'admin'); v.fill('input[name=password]', 'admin12345'); v.click('#demo-enter'); v.wait_for_timeout(1300)
                for page, sels in PAGES.items():
                    m.evaluate(f"location.hash='#{MOCK_ROUTE.get(page, page)}'"); v.evaluate(f"location.hash='#{V3_ROUTE.get(page, page)}'")
                    m.mouse.move(0, 0); v.mouse.move(0, 0)
                    m.wait_for_timeout(1000); v.wait_for_timeout(3500)
                    tag = f'{page}-{theme}-{width}'
                    failures += [f'[{tag}] {x}' for x in compare(m.evaluate(GRAB, [sels, STYLE]), v.evaluate(GRAB, [sels, STYLE]), sels)]
                    m.screenshot(path=str(OUT / f'mock-{tag}.png')); v.screenshot(path=str(OUT / f'v3-{tag}.png'))
                m.close(); v.close()
        br.close()
    for f in failures:
        print('DIFF', f)
    print(f'paritas: {len(failures)} perbedaan style. Screenshot: {OUT}')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
