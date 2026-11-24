# BLOCKERS (lingkungan pengerjaan)

| ID | Blocker | Dampak | Status |
|---|---|---|---|
| BLK-001 | Tidak ada PostgreSQL asli di sandbox. | Migrasi, query ConMas, `EXPLAIN ANALYZE`, dan tes integrasi dijalankan di **pg-mem**, bukan Postgres asli. | Terbuka — jalankan di laptop/server |
| BLK-002 | Registry npm diblokir proxy sandbox (403). Install hanya dari cache offline; React diambil dari runtime sandbox (19.2.1), React Router tidak tersedia. `npm audit` tidak bisa. | Versi dependensi = yang ada di cache; audit belum ada. | Terbuka — `npm install && npm audit` di laptop |
| BLK-003 | Tidak ada akses langsung ke DB ConMas & i-Reporter. | Validasi angka memakai query yang dijalankan user (lihat OPEN_QUESTIONS). Belum ada perbandingan end-to-end per line. | Sebagian |
| BLK-004 | Clone/push GitHub diblokir (403). | Repo dikirim sebagai ZIP berisi riwayat git branch `feature/v3`. | Terbuka — push manual |
| BLK-005 | `@playwright/test` (npm) tidak bisa diinstal. | Uji paritas memakai **Python Playwright + Chromium** yang tersedia (`scripts/e2e/style_parity.py`). | Diatasi sementara |
| BLK-008 | `@types/react` tidak bisa diinstal (registry diblokir). | **Typecheck `apps/web` belum pernah dijalankan.** Kode web hanya terbukti lewat build Vite, ESLint, tes unit, dan uji browser. Jalankan `npm install && npm run typecheck` di laptop. | Terbuka |
| BLK-007 | Font UI mockup **Plus Jakarta Sans** dimuat dari Google Fonts (eksternal). Di sandbox (dan jaringan pabrik tanpa internet) jatuh ke DM Sans. | Screenshot mockup & V3 sama-sama memakai DM Sans → paritas valid untuk kondisi offline. Untuk tampilan dengan internet, sediakan file woff2 Plus Jakarta Sans lalu tambahkan @font-face lokal. | Terbuka — perlu file font |
| BLK-006 | Sandbox ter-reset antar sesi; file sumber yang di-upload user hilang. | Sesi 2 merekonstruksi repo dari riwayat percakapan (diverifikasi: 102/102 tes identik sebelum perubahan). LOGIC_SPEC, COPILOT_PROMPT, dan mockup sudah di-upload ulang & masuk repo. **`AI_SYSTEM_ENGINEERING_GUIDE.md` masih belum ada** — salin dari laptop. | Sebagian |

Keterbatasan pg-mem (tes di sini tidak membuktikan perilaku Postgres asli):
- `GROUP BY 1, 2` tidak didukung → kode memakai ekspresi penuh (valid di Postgres).
- `ON CONFLICT ... DO NOTHING RETURNING` tetap mengembalikan baris → optimistic locking memakai INSERT polos + tangkap SQLSTATE 23505; `storeSnapshot` memverifikasi timestamp tersimpan.
- `trim`, `nullif`, `date`, `to_char`, operator `~` didaftarkan manual di harness.
- `array_agg` di subquery tidak jalan benar → `GET /access/users` belum dites.
- Uji "dua pairing bersamaan" membuktikan logika atomik aplikasi, bukan row-locking Postgres.
