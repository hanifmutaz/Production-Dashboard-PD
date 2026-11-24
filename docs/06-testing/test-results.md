# Hasil tes (NYATA, `npm run verify` di sandbox, 2026-11-25 sesi 2)

Lingkungan: Node v24.22.1, npm 11.21.2. **Tanpa Postgres asli** — integrasi memakai pg-mem (BLOCKERS.md).

```
config/reportColumns.example.js: 873 kolom dirujuk, 0 error, 2 peringatan
 ✓ apps/api/src/test/security.test.ts (20 tests) 38400ms
 ✓ apps/api/src/test/decisions.test.ts (11 tests) 20016ms
 ✓ apps/api/src/test/reporting.test.ts (14 tests) 18691ms
 ✓ packages/shared/src/shift.test.ts (37 tests) 52ms
 ✓ packages/shared/src/formulas.test.ts (21 tests) 80ms
 ✓ apps/api/src/config/env.test.ts (2 tests) 25ms
 ✓ apps/api/src/db/conmas.test.ts (13 tests) 18ms
 ✓ scripts/validateColumns.test.ts (3 tests) 25ms
 ✓ packages/shared/src/runningRules.test.ts (2 tests) 10ms
 Test Files  9 passed (9)
      Tests  123 passed (123)
VERIFY_EXIT=0
```

Langkah verify: validate:columns → typecheck → lint → format:check → test → build.

## Riwayat
- Sesi 1: 102 tes. Sesi 2 rebuild: 102/102 identik sebelum perubahan. Setelah keputusan OQ: 123 tes.

## Belum dites / tidak bisa dibuktikan di sini
- Migrasi & query di PostgreSQL asli; `EXPLAIN ANALYZE`.
- Perbandingan angka end-to-end vs i-Reporter per line/tanggal.
- `npm audit` (registry diblokir).
- Frontend/Playwright.
- `GET/PATCH /access/users`, ekspor xlsx/tsv, template ekspor.
