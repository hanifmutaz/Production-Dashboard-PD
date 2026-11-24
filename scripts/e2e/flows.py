"""Uji alur end-to-end di browser terhadap server V3 (npm run dev:mem, DEV_NOW=2026-11-24T03:00:00Z).

Menjalankan alur nyata: login, semua halaman tanpa error JS, interaksi utama, simpan Settings, ekspor file,
Custom Role (menu terbatas), pairing iPad (kiosk hanya line-nya). Gagal = exit 1.
"""
import os, sys, re
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BASE_URL', 'http://localhost:3100/')
results = []


def check(name, fn):
    try:
        fn()
        results.append(('OK', name))
    except Exception as e:  # noqa: BLE001 — laporkan semua kegagalan
        results.append(('FAIL', f'{name}: {str(e).splitlines()[0][:200]}'))


def login(pg, user='admin', pw='admin12345'):
    pg.goto(BASE)
    pg.fill('input[name=username]', user)
    pg.fill('input[name=password]', pw)
    pg.click('#demo-enter')
    expect(pg.locator('#page-title')).to_be_visible(timeout=8000)


def go(pg, route):
    pg.evaluate(f"location.hash='#{route}'")


def main() -> int:
    with sync_playwright() as p:
        kw = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}
        br = p.chromium.launch(**kw)
        ctx = br.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
        pg = ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        login(pg)

        def all_pages():
            for r, title in [('executive', 'Executive Performance Dashboard'), ('hub', 'Master Dashboard Utama'), ('master-internal', 'Master Dashboard'),
                             ('master-sgp', 'Master Dashboard'), ('stoptime-internal', 'Stoptime'), ('monitoring-output', 'Monitoring Output per Line'),
                             ('lines', 'Pilih Line'), ('line-dev-l01', 'Detail Line'), ('export', 'Export Data'), ('settings', 'Settings')]:
                go(pg, r)
                expect(pg.locator('#page-title')).to_have_text(title, timeout=8000)
            assert not errors, errors
        check('semua halaman terbuka tanpa error JavaScript', all_pages)

        def hub():
            go(pg, 'hub')
            pg.click('#hub-tab-monthly')
            expect(pg.locator('#hub-panel-monthly h2').first).to_have_text('Kinerja Produksi Periode')
            expect(pg.locator('.hub-output-plot path.hub-trend-line').first).to_be_attached(timeout=8000)
        check('Hub: tab Bulanan + grafik tren tergambar', hub)

        def master():
            go(pg, 'master-internal')
            expect(pg.locator('#mlrows tr')).to_have_count(3, timeout=10000)
            pg.click('[data-master-step="day:-1"]')
            expect(pg.locator('.master-rank-head b')).to_have_text('23 November 2026')
            pg.fill('#q', 'L02')
            expect(pg.locator('#mlrows tr')).to_have_count(1)
        check('Master: geser tanggal & cari line', master)

        def stoptime():
            go(pg, 'stoptime-internal')
            expect(pg.locator('#strows tr').first).not_to_contain_text('Belum ada kejadian', timeout=10000)
            pg.click('[data-cat="Man"]')
            expect(pg.locator('#strows tr').first).to_contain_text('Belum ada kejadian')
            pg.click('[data-cat="Machine"]')
            expect(pg.locator('#strows tr').first).to_contain_text('Machine')
        check('Stoptime: filter kategori 4M', stoptime)

        def monitoring():
            go(pg, 'monitoring-output')
            host = pg.locator('production-monitoring')
            host.locator('.line-pick', has_text='DEV-L01').click(timeout=10000)
            expect(host.locator('#detail-title')).to_contain_text('DEV-L01')
            host.locator('.cell-pick[data-line="DEV-L01"][data-day="24"]').click()
            expect(host.locator('.shift').first).to_contain_text('Shift 1', timeout=10000)
            host.locator('[data-tab="output"]').click()
            expect(host.locator('.detail-table table').first).to_contain_text('PRODUK-DEV-1')
            host.locator('#meeting').click()
            expect(host.locator('#meeting')).to_have_attribute('aria-pressed', 'true')
            pg.keyboard.press('Escape')
            expect(host.locator('#meeting')).to_have_attribute('aria-pressed', 'false')
        check('Monitoring: pilih line/tanggal, detail shift & produk, Mode Meeting', monitoring)

        def kiosk():
            go(pg, 'line-dev-l01')
            expect(pg.locator('.ps')).to_have_text('RUNNING', timeout=10000)
            pg.click('[data-lmode="range"]')
            expect(pg.locator('.ttl')).to_contain_text('REKAP DATA PRODUKSI')
            expect(pg.locator('.eh .ac')).to_contain_text('hari data', timeout=10000)
        check('Detail Line: live RUNNING lalu mode Rentang', kiosk)

        def export():
            go(pg, 'export')
            expect(pg.locator('.pvt tbody tr').first).to_be_visible(timeout=10000)
            pg.select_option('#x-format', 'json')
            with pg.expect_download() as dl:
                pg.click('[data-xdl]')
            path = dl.value.path()
            assert dl.value.suggested_filename.endswith('.json'), dl.value.suggested_filename
            assert '"Line"' in open(path, encoding='utf-8').read()
        check('Export: pratinjau + unduh JSON', export)

        def settings_kpi():
            go(pg, 'settings')
            pg.click('[data-setting-section="kpi"]')
            pg.fill('#cfg-yellow', '80')
            pg.click('#settings-form .settings-save .btn')
            expect(pg.locator('.settings-feedback').first).to_have_text('Perubahan disimpan.', timeout=8000)
            expect(pg.locator('#settings-kpi-preview')).to_contain_text('80%')
        check('Settings: simpan ambang KPI (legenda ikut berubah)', settings_kpi)

        def settings_defect():
            pg.click('[data-setting-section="loss"]')
            pg.click('[data-setting-group="defects"]')
            pg.click('[data-setting-new]')
            pg.fill('#cfg-code', 'Scratch')
            pg.fill('#cfg-name', 'Gores')
            pg.click('#settings-form .settings-save .btn')
            expect(pg.locator('#settings-table')).to_contain_text('Gores', timeout=8000)
        check('Settings: tambah defect', settings_defect)

        def settings_role_device():
            pg.click('[data-setting-section="access"]')
            pg.click('[data-setting-group="customRoles"]')
            pg.fill('#custom-role-form input[name=label]', 'Meeting Room')
            pg.check('#custom-role-form input[value="monitoring-output"]')
            pg.check('#custom-role-form input[value="lines"]')
            pg.click('#custom-role-form .velvet-action')
            expect(pg.locator('.velvet-role-list')).to_contain_text('Meeting Room', timeout=8000)
            pg.click('[data-setting-group="users"]')
            pg.click('[data-setting-new]')
            pg.fill('#cfg-username', 'rapat1')
            pg.fill('#cfg-name', 'Ruang Rapat')
            pg.select_option('#cfg-role', 'meeting-room')
            pg.fill('#cfg-password', 'password-rapat-1')
            pg.click('#settings-form .settings-save .btn')
            expect(pg.locator('#settings-table')).to_contain_text('Ruang Rapat', timeout=8000)
            pg.click('[data-setting-group="devices"]')
            pg.fill('#device-form input[name=name]', 'iPad DEV-L02')
            pg.select_option('#device-form select[name=line]', 'DEV-L02')
            pg.click('#device-form .velvet-action')
            code = pg.locator('.settings-feedback strong').inner_text(timeout=8000)
            assert re.fullmatch(r'[A-Z2-9]{4}-[A-Z2-9]{4}', code), code
            settings_role_device.code = code
        check('Settings: Custom Role + akun + kode pairing iPad', settings_role_device)

        def custom_role_nav():
            p2 = br.new_context(viewport={'width': 1440, 'height': 900}).new_page()
            login(p2, 'rapat1', 'password-rapat-1')
            hrefs = p2.eval_on_selector_all('#nav a', 'els=>els.map(e=>e.getAttribute("href"))')
            assert hrefs == ['#monitoring-output', '#lines'], hrefs
            p2.evaluate("location.hash='#executive'")
            expect(p2.locator('#page-title')).to_have_text('Monitoring Output per Line', timeout=8000)
            p2.context.close()
        check('Custom Role: menu dibatasi & rute lain diarahkan', custom_role_nav)

        def ipad():
            code = getattr(settings_role_device, 'code', None)
            assert code, 'kode pairing tidak ada'
            p3 = br.new_context(viewport={'width': 1180, 'height': 820}).new_page()
            p3.goto(BASE)
            p3.fill('#pair-form input[name=code]', code)
            p3.click('#pair-form .btn')
            expect(p3.locator('.lcode')).to_have_text('DEV-L02', timeout=10000)
            assert p3.locator('#side').count() == 0, 'kiosk tidak boleh menampilkan sidebar'
            p3.context.close()
        check('iPad: pairing → kiosk hanya line DEV-L02', ipad)

        def logout():
            pg.click('#profile-trigger')
            pg.click('#demo-logout')
            expect(pg.locator('#demo-login-form')).to_be_visible()
        check('Logout kembali ke login', logout)
        br.close()
    for status, name in results:
        print(status, name)
    failed = [r for r in results if r[0] == 'FAIL']
    print(f'alur: {len(results) - len(failed)}/{len(results)} lulus')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
