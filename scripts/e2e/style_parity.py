"""Uji paritas tampilan V3 vs mockup (npm run test:e2e).

Membandingkan COMPUTED STYLE elemen kunci (font, warna, border, radius, padding, display, gap) antara
mockup HTML dan aplikasi V3 yang sedang jalan. Bukan pixel diff: data V3 (API) beda dari dummy mockup,
jadi ukuran/posisi & warna band pencapaian sengaja tidak dibandingkan. Screenshot disimpan untuk cek mata.

Prasyarat: Python + playwright, Chromium (env CHROME_PATH opsional), server V3 jalan (npm run dev:mem),
login admin/admin12345 (dev:mem). Env BASE_URL default http://localhost:3100/.
"""
import json, os, pathlib, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
MOCK = (ROOT / 'docs/mockup/Dashboard-Produksi-Hirose-Industrial-Velvet-DMSans-Fix.html').as_uri()
BASE = os.environ.get('BASE_URL', 'http://localhost:3100/')
OUT = ROOT / 'test-results' / 'parity'
STYLE = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'border-top', 'border-radius', 'padding', 'display', 'gap', 'background-color']
# Halaman yang sudah di-port. Tambah saat halaman baru selesai.
PAGES = {
    'executive': ['#side', '.brand', '#collapse', '#nav .g', '#nav .it[aria-current]', '#nav button.it', '#settings-dock .it', '.global-bar', '#page-title', '#page-context', '#theme', '#profile-trigger', '.exec-head', '#mo', '#yr', '.exec-summary', '.exec-spotlight', '.exec-spotlight h2', '.exec-spotlight-value', '.exec-spotlight p', '.exec-stats > div', '.exec-stats dt', '.exec-stats dd strong', '.exec-stats dd small', '.exec-panel', '.exec-panel-head h2', '.exec-date-note', '.exec-locations thead th', '.exec-location-name', '.exec-workdays', '.exec-edit', '.exec-actual strong', '.exec-target-pair dt', '.exec-target-pair dd', '.exec-progress-caption', '.exec-table-key', '.achievement-legend span'],
}
LOGIN = ['.login-visual', '.login-brand', '.login-card', '.login-title', '.login-toolbar', '#login-theme', '#demo-enter', '#pair-form input', '#pair-form .btn', '.login-notice']
GRAB = """([sels,props])=>Object.fromEntries(sels.map(s=>{const e=document.querySelector(s);if(!e)return [s,null];const c=getComputedStyle(e);return [s,Object.fromEntries(props.map(p=>[p,c.getPropertyValue(p)]))]}))"""


def compare(a, b, sels):
    bad = []
    for s in sels:
        if a.get(s) is None or b.get(s) is None:
            bad.append(f'{s}: hilang (mock={a.get(s) is not None}, v3={b.get(s) is not None})')
            continue
        d = [f'{k}: {a[s][k]!r} -> {b[s][k]!r}' for k in STYLE if a[s][k] != b[s][k]]
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
                    for pg in (m, v):
                        pg.evaluate(f"location.hash='#{page}'"); pg.mouse.move(0, 0)
                    m.wait_for_timeout(900); v.wait_for_timeout(1300)
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
