# Dashboard Production V3 — Industrial Velvet (Hirose Internal)

Status: **backend + semua halaman frontend selesai; teruji di emulator (pg-mem) + browser (Chromium). Belum diuji di Postgres asli.** Lihat `docs/PROGRESS.md`, `docs/FINAL_REPORT.md`, `docs/OPEN_QUESTIONS.md`.

> File sumber berikut **tidak ada di ZIP ini** (lingkungan pengerjaan ter-reset) — salin dari laptop:
> `AI_SYSTEM_ENGINEERING_GUIDE.md` (root), `docs/LOGIC_SPEC_Dashboard_Lama.md`, `docs/COPILOT_PROMPT_V3.md`, `docs/mockup/Dashboard-Produksi-Hirose-Industrial-Velvet-DMSans-Fix.html`.

## Prasyarat
Node ≥ 20, npm, PostgreSQL (DB dashboard terpisah) + akses **read-only** ke DB ConMas.

## Setup
```bash
npm install
cp .env.example .env                      # isi URL DB
cp config/reportColumns.example.js config/reportColumns.js
npm run verify                            # harus EXIT 0
npm run db:migrate                        # DB dashboard (BELUM diuji di Postgres asli)
ADMIN_USERNAME=admin ADMIN_PASSWORD='min10karakter' npm run db:seed:admin
npm run dev                               # API di http://localhost:3000
```
Coba UI tanpa database sama sekali: `npm run dev:mem` → http://localhost:3000 (login `admin` / `admin12345`, data fixture sintetis).

Dev dengan Postgres lokal tanpa DB ConMas: `DEV_FIXTURE_DATABASE_URL=postgres://.../dev npm run db:seed:dev`, lalu `DB_VIEW_NAME=view_report_dev`.

## Daftar akun mandiri + approval admin
- Pengguna baru daftar sendiri lewat tombol **Daftar** di halaman login (email, nama, departemen, kebutuhan, password). Akun berstatus `pending` dan **belum bisa login**.
- Admin (izin `users.manage`) menyetujui/menolak di **Settings → Pengguna & Akses → Pendaftaran**; role & cakupan lokasi ditentukan admin saat menyetujui. Pendaftar tidak bisa memilih role sendiri.
- Email yang ditolak boleh mendaftar ulang. Semua aksi tercatat di audit log (`user.register`, `user.registration.approve/reject`).
- Migrasi baru: `1732800000000_user_registration.sql` (jalankan `npm run db:migrate`). Akun yang sudah ada otomatis `approved`.
