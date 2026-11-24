# BLOCKERS (lingkungan pengerjaan)

| ID | Blocker | Dampak | Status |
|---|---|---|---|
| BLK-001 | Tidak ada PostgreSQL asli di sandbox. | Migrasi, query ConMas, `EXPLAIN ANALYZE`, dan tes integrasi dijalankan di **pg-mem**, bukan Postgres asli. | Terbuka — jalankan di laptop/server |
| BLK-002 | Registry npm diblokir proxy sandbox (403). Sesi 2: install hanya berhasil dari cache offline sesi 1. `npm audit` tidak bisa. | Versi dependensi = yang ada di cache; audit belum ada. | Terbuka — `npm install && npm audit` di laptop |
| BLK-003 | Tidak ada akses langsung ke DB ConMas & i-Reporter. | Validasi angka memakai query yang dijalankan user (lihat OPEN_QUESTIONS). Belum ada perbandingan end-to-end per line. | Sebagian |
| BLK-004 | Clone/push GitHub diblokir (403). | Repo dikirim sebagai ZIP berisi riwayat git branch `feature/v3`. | Terbuka — push manual |
| BLK-005 | Playwright/frontend belum ada. | Tes screenshot belum ada (Tahap E). | Terbuka |
| BLK-006 | Sandbox ter-reset antar sesi; file sumber yang di-upload user hilang. | Sesi 2 merekonstruksi repo dari riwayat percakapan (diverifikasi: 102/102 tes identik sebelum perubahan). **`docs/LOGIC_SPEC_Dashboard_Lama.md`, `docs/COPILOT_PROMPT_V3.md`, `AI_SYSTEM_ENGINEERING_GUIDE.md`, dan `docs/mockup/*.html` tidak ada di ZIP ini** — salin dari laptop user. | Terbuka |

Keterbatasan pg-mem (tes di sini tidak membuktikan perilaku Postgres asli):
- `GROUP BY 1, 2` tidak didukung → kode memakai ekspresi penuh (valid di Postgres).
- `ON CONFLICT ... DO NOTHING RETURNING` tetap mengembalikan baris → optimistic locking memakai INSERT polos + tangkap SQLSTATE 23505; `storeSnapshot` memverifikasi timestamp tersimpan.
- `trim`, `nullif`, `date`, `to_char`, operator `~` didaftarkan manual di harness.
- `array_agg` di subquery tidak jalan benar → `GET /access/users` belum dites.
- Uji "dua pairing bersamaan" membuktikan logika atomik aplikasi, bukan row-locking Postgres.
