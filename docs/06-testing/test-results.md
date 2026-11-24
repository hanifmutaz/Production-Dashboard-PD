# Hasil tes (NYATA, sandbox, 2026-11-25 sesi 3)

Node v24.22.1, npm 11.21.2, Chromium 1228 (Python Playwright). Tanpa Postgres asli (pg-mem).

```
config/reportColumns.example.js: 873 kolom dirujuk, 0 error, 2 peringatan
TYPECHECK_TANPA_WEB_OK
 ✓ apps/api/src/test/security.test.ts (20 tests) 37999ms
 ✓ apps/api/src/test/decisions.test.ts (11 tests) 20462ms
 ✓ apps/api/src/test/reporting.test.ts (14 tests) 18080ms
 ✓ packages/shared/src/formulas.test.ts (21 tests) 57ms
 ✓ packages/shared/src/shift.test.ts (37 tests) 32ms
 ✓ scripts/validateColumns.test.ts (3 tests) 33ms
 ✓ apps/web/src/lib/router.test.ts (3 tests) 10ms
 ✓ apps/api/src/config/env.test.ts (2 tests) 18ms
 ✓ apps/api/src/db/conmas.test.ts (13 tests) 18ms
 ✓ packages/shared/src/runningRules.test.ts (2 tests) 9ms
 ✓ apps/web/src/lib/achievement.test.ts (2 tests) 30ms
 Test Files  11 passed (11)
      Tests  128 passed (128)
✓ built in 803ms
VERIFY_EXIT=0
paritas: 0 perbedaan style. Screenshot: /home/claude/v3/test-results/parity
PARITY_EXIT=0
```

- Typecheck: shared + api + scripts **lulus**; **apps/web belum di-typecheck** (BLK-008, @types/react tidak tersedia).
- Uji paritas (`scripts/e2e/style_parity.py`): computed style 47 selector (login + shell + Executive) mockup vs V3, tema terang/gelap × lebar 1440/1024/390 → **0 perbedaan**. Screenshot: `docs/06-testing/parity/`.
- Uji alur browser (manual-otomatis): login salah → pesan; edit target 60.000 → 120.000 tersimpan & angka berubah; Kalender Kerja 21 → 20 hari kerja tersimpan; logout kembali ke login; 0 page error.

## Belum dites / tidak bisa dibuktikan
- Postgres asli, EXPLAIN ANALYZE, npm audit, typecheck web.
- Halaman selain Login/Shell/Executive (belum di-port).
- Perbandingan angka vs i-Reporter.
