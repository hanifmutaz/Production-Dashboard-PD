# BLOCKERS (lingkungan pengerjaan)

| ID | Blocker | Dampak | Status |
|---|---|---|---|
| BLK-001 | Tidak ada PostgreSQL asli di sandbox. | Migrasi, query ConMas, `EXPLAIN ANALYZE`, dan tes integrasi dijalankan di **pg-mem**, bukan Postgres asli. | Terbuka — jalankan di laptop/server |
| BLK-002 | ~~Registry npm diblokir proxy sandbox.~~ `npm install` berhasil; `npm audit` melaporkan 5 moderate (transitive: `exceljs`→`uuid`, `node-pg-migrate`→`glob`/`minimatch`). | Perlu dipantau; `audit fix --force` melakukan downgrade major, jadi tunggu upstream atau pakai `overrides`. | Sebagian |
| BLK-003 | Tidak ada akses langsung ke DB ConMas & i-Reporter. | Validasi angka memakai query yang dijalankan user (lihat OPEN_QUESTIONS). Belum ada perbandingan end-to-end per line. | Sebagian |
| BLK-004 | ~~Clone/push GitHub diblokir (403).~~ | Repo sekarang di GitHub (`hanifmutaz/Production-Dashboard-PD`) dan bisa di-clone. | **Selesai** |
| BLK-005 | `@playwright/test` (npm) tidak bisa diinstal. | Uji paritas & alur memakai **Python Playwright + Chromium** (`scripts/e2e/style_parity.py`, `scripts/e2e/flows.py`). | Diatasi sementara |
| BLK-008 | ~~`@types/react` tidak bisa diinstal.~~ | `npm run typecheck` (termasuk `apps/web`) lulus di mesin dengan akses npm penuh (2026-11-25). | **Selesai** |
| BLK-007 | Font UI mockup **Plus Jakarta Sans** dimuat dari Google Fonts (eksternal). Di sandbox (dan jaringan pabrik tanpa internet) jatuh ke DM Sans. | Screenshot mockup & V3 sama-sama memakai DM Sans → paritas valid untuk kondisi offline. Untuk tampilan dengan internet, sediakan file woff2 Plus Jakarta Sans lalu tambahkan @font-face lokal. | Terbuka — perlu file font |
| BLK-006 | Sandbox ter-reset antar sesi; file sumber yang di-upload user hilang. | LOGIC_SPEC, COPILOT_PROMPT, mockup, dan `AI_SYSTEM_ENGINEERING_GUIDE.md` sekarang semuanya ada di repo. | **Selesai** |

Keterbatasan pg-mem (tes di sini tidak membuktikan perilaku Postgres asli):
- `GROUP BY 1, 2` tidak didukung → kode memakai ekspresi penuh (valid di Postgres).
- `ON CONFLICT ... DO NOTHING RETURNING` tetap mengembalikan baris → optimistic locking memakai INSERT polos + tangkap SQLSTATE 23505; `storeSnapshot` memverifikasi timestamp tersimpan.
- `trim`, `nullif`, `date`, `to_char`, operator `~` didaftarkan manual di harness.
- `array_agg` di subquery tidak jalan di pg-mem → query daftar akun ditulis ulang tanpa `array_agg` (portabel), sekarang dites.
- Uji "dua pairing bersamaan" membuktikan logika atomik aplikasi, bukan row-locking Postgres.
- pg-mem lambat untuk query lebar (±1–2 detik per request halaman di dev:mem). Di Postgres asli diperkirakan jauh lebih cepat — **belum diukur**.
- Ditemukan & diperbaiki sesi 4: `tsx` memuat `@v3/shared` dari `dist` lama → skrip `dev`/`dev:mem` sekarang build `shared` dulu.
