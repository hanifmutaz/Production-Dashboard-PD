# Hasil tes (NYATA, sandbox, 2026-11-25 sesi 4)

Node v24.22.1, npm 11.21.2, Chromium 1228 (Python Playwright). Tanpa Postgres asli (pg-mem).

## Langkah verify
```
config/reportColumns.example.js: 873 kolom dirujuk, 0 error, 2 peringatan
typecheck shared + api + scripts: OK
typecheck apps/web: TIDAK DIJALANKAN (BLK-008, @types/react tidak tersedia)
lint: OK · format:check: OK
 ✓ apps/api/src/test/reporting.test.ts (14 tests) 18628ms
 ✓ apps/api/src/test/security.test.ts (20 tests) 37450ms
 ✓ apps/api/src/test/decisions.test.ts (11 tests) 20794ms
 ✓ apps/api/src/test/pages.test.ts (9 tests) 11610ms
 ✓ apps/api/src/test/export.test.ts (6 tests) 10270ms
 ✓ packages/shared/src/formulas.test.ts (21 tests) 55ms
 ✓ packages/shared/src/shift.test.ts (37 tests) 39ms
 ✓ apps/web/src/lib/achievement.test.ts (2 tests) 31ms
 ✓ apps/api/src/config/env.test.ts (2 tests) 20ms
 ✓ scripts/validateColumns.test.ts (3 tests) 36ms
 ✓ apps/api/src/db/conmas.test.ts (13 tests) 18ms
 ✓ apps/web/src/lib/router.test.ts (3 tests) 6ms
 ✓ packages/shared/src/runningRules.test.ts (2 tests) 9ms
 Test Files  13 passed (13)
      Tests  143 passed (143)
build shared + api + web: OK
```

## Uji browser (`npm run test:e2e`)
```
paritas: 0 perbedaan style. Screenshot: /home/claude/v3/test-results/parity
OK semua halaman terbuka tanpa error JavaScript
OK Hub: tab Bulanan + grafik tren tergambar
OK Master: geser tanggal & cari line
OK Stoptime: filter kategori 4M
OK Monitoring: pilih line/tanggal, detail shift & produk, Mode Meeting
OK Detail Line: live RUNNING lalu mode Rentang
OK Export: pratinjau + unduh JSON
OK Settings: simpan ambang KPI (legenda ikut berubah)
OK Settings: tambah defect
OK Settings: Custom Role + akun + kode pairing iPad
OK Custom Role: menu dibatasi & rute lain diarahkan
OK iPad: pairing → kiosk hanya line DEV-L02
OK Logout kembali ke login
alur: 13/13 lulus
```

- Paritas: computed style elemen kunci di 10 layar (login + 9 halaman), tema terang/gelap × lebar 1440/1024/390. Monitoring dicek di dalam shadow DOM. Screenshot contoh di `docs/06-testing/parity/`.

## Belum dites / tidak bisa dibuktikan
- Typecheck `apps/web` (jalankan `npm install && npm run typecheck` di laptop).
- Postgres asli: migrasi 1 & 2, EXPLAIN ANALYZE, performa.
- npm audit.
- Perbandingan angka vs i-Reporter per line/tanggal.
