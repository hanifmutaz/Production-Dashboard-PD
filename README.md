# Dashboard Production V3 — Industrial Velvet (Hirose Internal)

Status: **backend + logika inti selesai & teruji di emulator (pg-mem); frontend BELUM dibangun.** Lihat `docs/PROGRESS.md`, `docs/FINAL_REPORT.md`, `docs/OPEN_QUESTIONS.md`.

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
Dev tanpa DB ConMas: `DEV_FIXTURE_DATABASE_URL=postgres://.../dev npm run db:seed:dev`, lalu `DB_VIEW_NAME=view_report_dev`.
