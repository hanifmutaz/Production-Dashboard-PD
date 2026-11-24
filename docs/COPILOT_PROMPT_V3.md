# PROMPT COPILOT — Bangun "Dashboard Production V3 — Industrial Velvet" dari nol (TypeScript + Node.js, npm)

Kamu bekerja **otonom dari awal sampai akhir dalam satu sesi panjang**. Jangan berhenti menunggu persetujuan antar-fase. Berhenti hanya jika (a) berkas masukan wajib di Bagian 0 tidak ada, atau (b) ada keputusan yang tidak bisa diasumsikan dengan aman (lihat Bagian 9). Selain itu: asumsikan secara eksplisit, catat, lanjut.

Copilot tidak punya akses ke repo lama. Semua konteks ada di `docs/`. **Baca semuanya dulu sebelum menulis kode.**

---

## 0. Berkas masukan (cek dulu)

| Berkas | Fungsi |
|---|---|
| `AI_SYSTEM_ENGINEERING_GUIDE.md` (root repo) | **Aturan kerja, gaya kode, gate G0–G7, format laporan.** Wajib diikuti (Bagian 2) |
| `docs/mockup/Dashboard-Produksi-Hirose-Industrial-Velvet-DMSans-Fix.html` | **Sumber kebenaran tampilan & interaksi** — tiru 1:1 |
| `docs/LOGIC_SPEC_Dashboard_Lama.md` | **Sumber kebenaran logika, rumus, shift, aturan data** dari dashboard lama |
| `docs/reportColumns.example.js` | Mapping kolom view i-Reporter/ConMas (sudah dikoreksi) |
| `docs/view_columns.txt` | Header lengkap view (1.034 kolom: no, nama kolom, tipe, label) |

Kurang satu → berhenti dan minta user melampirkan. Jangan menebak isinya.

## 1. Tujuan & scope

Aplikasi baru dengan **tampilan dan perilaku 1:1 dengan mockup**, **logika sama dengan dashboard lama** (LOGIC_SPEC). Tahap ini **hanya Hirose Internal**. SGP & Systech tetap ada di menu/pilihan lokasi dengan status **On Hold** (tanpa request, tanpa angka 0 palsu, tanpa dummy). Bahasa UI: Indonesia, sesuai mockup.

## 2. Kepatuhan terhadap AI_SYSTEM_ENGINEERING_GUIDE.md

Baca dan ikuti panduan itu. Penerapan konkret untuk proyek ini:

**G0 — Klasifikasi risiko (tulis di `docs/01-project/risk-assessment.md`, boleh kamu koreksi dengan alasan).** Proposal awal: **MEDIUM** — aplikasi operasional internal, ada login + RBAC, banyak pengguna, membaca DB vendor (read-only), angka yang salah menyesatkan keputusan produksi (dampak perhitungan salah = tinggi), downtime mengganggu pemantauan tetapi tidak menghentikan produksi. Terapkan kontrol per dimensi risiko, bukan hanya label.

**Business invariants minimal (INV-xxx) yang harus dilindungi & diuji:**
- INV-001 DB ConMas tidak pernah ditulis (akun DB read-only + tidak ada query non-SELECT ke koneksi ConMas).
- INV-002 Angka agregat memakai rumus LOGIC_SPEC; hari tanpa data ≠ 0 (`hasData=false`).
- INV-003 Tanggal selalu UTC-eksplisit/WIB sesuai spec (tidak boleh geser hari).
- INV-004 Endpoint tulis/ekspor hanya bisa diakses role/permission yang berhak (server-side).
- INV-005 Kode pairing perangkat sekali pakai dan kedaluwarsa (konsumsi atomik).
- INV-006 Penyimpanan target/kalender/settings tidak boleh saling menimpa diam-diam (optimistic locking dengan kolom `version`; konflik → 409).
- INV-007 Snapshot push-sync yang lebih tua tidak menimpa yang lebih baru.
- INV-008 Setiap aksi sensitif tercatat di audit log.

**G1 — Requirements:** `docs/01-project/requirements.md` dengan FR-xxx/NFR-xxx/INV-xxx, acceptance criteria yang bisa diuji, dan matriks keterlacakan (kebutuhan → modul → tes). Jangan mengarang aturan bisnis; hal tak diketahui masuk `docs/OPEN_QUESTIONS.md`.

**G2 — Arsitektur:** **modular monolith** (bukan microservices). Tanpa Docker/Redis/queue/event bus kecuali ada kebutuhan terukur. Tulis ADR singkat di `docs/02-architecture/adr/` untuk: pilihan stack, router/state frontend, strategi session/auth, strategi optimistic locking, pengelolaan snapshot push-sync, pemisahan DB ConMas vs DB dashboard, penanganan On Hold.

**Modul backend (data ownership jelas; modul tidak menulis data milik modul lain):**
`auth`, `access` (user, role, permission, scope lokasi, device pairing), `reporting` (baca ConMas: summary, detail line, trend, reject, stoptime, breakdown), `executive` (target, kalender, achievement), `master-data` (lokasi, line, mesin, produk, shift, penyebab, defect), `settings`, `export`, `audit`, `sync` (push-sync penerima, hanya aktif bila `SUBCONT_ENABLED=true`).
Arah dependensi: `routes → modul service → query/domain`. `domain` (rumus, shift, status line) adalah **fungsi murni** tanpa HTTP/DB/fs. **Dilarang** lapisan yang hanya meneruskan panggilan.

**G3–G7:** jalankan sesuai Bagian 6 dan 7 di bawah. Format laporan akhir mengikuti panduan Bagian 23 dan matriks kepatuhan panduan Bagian 20. **Jangan mengarang hasil tes/perintah.** Status hanya PASS bila ada bukti; selain itu PARTIAL/FAIL dengan alasan jujur.

## 3. Stack (TypeScript + Node.js, npm)

- Node 20 LTS, **npm workspaces** (bukan pnpm/yarn). Satu lockfile `package-lock.json`.
- Struktur: `apps/api`, `apps/web`, `packages/shared` (fungsi murni rumus/shift/format + tipe kontrak API; dipakai api & web), `docs/`, `scripts/`.
- **TypeScript `strict: true`**, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; **dilarang `any`** (pakai `unknown` + validasi). ESM. Path alias lewat `tsconfig` paths.
- **Backend:** Express 4/5, `pg`, `zod` (validasi semua input & env), `argon2`, `helmet`, `express-rate-limit`, `pino` + `pino-http` (redaksi password/token/cookie/key), `exceljs`, `node-pg-migrate` (migrasi SQL ber-versi). Dev: `tsx`; build: `tsc`.
- **Frontend:** React 18 + Vite + React Router + CSS dari mockup. Grafik = SVG sendiri seperti mockup. Tanpa UI kit.
- **Kualitas:** ESLint (`@typescript-eslint` strict) + Prettier, `vitest` (unit/integration, `supertest` untuk API), Playwright (screenshot + alur kritis). Husky/lint-staged opsional.
- **npm scripts wajib di root:** `dev`, `build`, `typecheck`, `lint`, `format:check`, `test`, `test:unit`, `test:integration`, `test:e2e`, `db:migrate`, `db:seed:dev`, `validate:columns`, `verify` (= typecheck + lint + format:check + test + build).

## 4. Gaya kode (dari panduan, bagian 12 & 3.3)

- Nama = makna bisnis (`bekidoritsu`, `operatorAvailability`, `shiftWindow`), identifier Inggris; **komentar Indonesia singkat hanya untuk alasan/constraint**, bukan mengulang kode.
- Fungsi satu tujuan; parameter banyak → objek bertipe. Aturan bisnis **tidak diduplikasi** antar lapisan (rumus hanya di `packages/shared`).
- Validasi input di server (zod) di setiap batas; otorisasi di server (middleware `requirePermission`), UI hanya cermin.
- Error: model error seragam `{ error: { code, message, requestId } }`; status HTTP jujur (400/401/403/404/409/422/429/500; **jangan 200 untuk gagal**); tanpa stack trace/SQL/path internal. "Tidak ada data" = 200 + `data: null` + status (itu bukan error).
- Tidak ada error ditelan diam-diam. Tidak ada secret/URL/kredensial hardcode; semua konfigurasi dari env yang divalidasi zod saat start (gagal cepat dengan pesan jelas).
- Transaksi pendek; tidak ada pemanggilan jaringan di dalam transaksi terbuka. Operasi non-idempoten tidak di-retry buta.
- Commit bermakna: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:` (bukan "update"/"final"). Satu modul/halaman satu commit atau lebih kecil.
- Frontend: tiap alur penting menangani state default, loading, sukses, kosong, validasi, error, forbidden, disabled/in-progress; cegah submit ganda; pesan error ramah tanpa internal.

## 5. Aturan keras proyek

1. DB ConMas **read-only** (pool terpisah, `default_transaction_read_only=on`; tidak ada DDL/DML).
2. Data aplikasi di **database dashboard terpisah** (PostgreSQL), lewat migrasi `node-pg-migrate`; bukan file JSON, bukan DB ConMas.
3. `config/reportColumns.js` **di-gitignore** (nama view beda per instance via `DB_VIEW_NAME`); commit hanya `reportColumns.example.js`. Server berhenti dengan pesan jelas bila tidak ada. Tulis versi TypeScript bertipe sebagai `reportColumns.example.ts` bila perlu, tetapi file runtime tetap di-gitignore.
4. `.env` tidak di-commit; sediakan `.env.example` lengkap + skema zod.
5. **Tanpa data dummy di production.** Fixture dev hanya saat `NODE_ENV !== 'production'`.
6. **Jangan membuat rumus sendiri.** Pakai LOGIC_SPEC. Item ⚠️ → `docs/OPEN_QUESTIONS.md`, pakai perilaku lama yang tertulis.
7. Jangan memakai nama kolom yang tidak ada di `view_columns.txt`; `validate:columns` harus lulus.
8. Jangan deploy. Jangan push ke `main`; kerja di branch `feature/v3`.
9. Push-sync penerima **dibangun** tetapi nonaktif lewat `SUBCONT_ENABLED=false` (default). SGP/Systech On Hold.
10. Jangan memperluas lingkup di luar mockup + LOGIC_SPEC tanpa mencatat alasan.

## 6. Urutan kerja (otonom, tanpa menunggu "lanjut")

Pertahankan **`docs/PROGRESS.md`** (checklist; perbarui setelah tiap langkah). Jika konteks terpotong/dilanjutkan, **baca PROGRESS.md dulu** lalu teruskan dari langkah berikutnya.

**Tahap A — Dokumen G0/G1/G2** (singkat, berbasis konteks yang ada; jangan mengajukan pertanyaan yang bisa dijawab dari berkas): risk-assessment, requirements + traceability, `docs/MOCKUP_INVENTORY.md` (daftar semua halaman/route/dialog/komponen/state/interaksi **hasil membaca mockup**), arsitektur + ADR, kontrak API, model data + ERD + invariant protection matrix.

**Tahap B — Fondasi:** monorepo, tsconfig, ESLint/Prettier, vitest, CI script `verify`, env schema, migrasi DB (`users, roles, role_permissions, role_menus, user_site_scope, devices, device_pairing_codes, audit_log, export_templates, settings, locations, lines, machines, products, targets, calendar_exceptions, shifts, loss_causes, defects, alerts, push_snapshots, push_status` — lengkap dengan PK/FK/unique/check/`version`/`updated_at`), skrip impor satu-kali dari `lines.json`/`executiveTargets.json`/`executiveCalendar.json` bila file tersedia, loader `reportColumns`, `validate:columns` (cocokkan `reportColumns.example.js` dengan `view_columns.txt` termasuk pola offset `REJECT_PAIRS`), fixture dev (view `view_report_dev` sintetis di Postgres lokal, hanya dev/test; mencakup shift malam lintas tanggal, 25 slot per jam, format shift `"Shift 1 (2 Shift)"`).

**Tahap C — Inti logika (TDD, `packages/shared`):** port persis `resolveShiftAndDate`, `shiftWindowFromLabel`, `pickActiveRow`, `getLineStatus3`, `isRowStale`, `hourToLabel`, `getShiftSlotLabels`, util WIB/UTC, bekidoritsu, operator availability, band pencapaian, kalender kerja (`workingDays`, `elapsedWorkingDays`, `targetHariIni`), format `id-ID`. Tes: shift 2 & 3, Jumat, lintas tengah malam, celah antar shift, `pickActiveRow` live/historis/override, stale, label `24-1`, slot index 0 vs 24, kalender bulan lampau/depan, pembulatan band, batas nol.

**Tahap D — Backend:** modul `reporting`, `executive`, `master-data`, `settings`, `sync` (endpoint `/api/v3/...`; kontrak sesuai LOGIC_SPEC bagian 6–9; SQL numeric-safe). Lalu `auth`, `access` (role bawaan Viewer/Supervisor/Admin + Custom Role menu & aksi + scope lokasi), device pairing + token perangkat + kiosk read-only, `export` server-side (xlsx/csv/tsv/json, template tersimpan), `audit`. Optimistic locking (409 saat konflik) untuk target/kalender/settings. Health check `/healthz` & `/readyz`. Request-id di semua log & error.

**Tahap E — Frontend:** ekstrak CSS/token/font/ikon dari mockup, shell (sidebar/rail/drawer/header/tema/layar penuh/Mode Meeting/router + redirect URL lama `?view=...`), komponen reusable, lalu halaman satu per satu: Executive → Master Hub → Master Dashboard lokasi → Monitoring Output per Line → Pilih Line/Detail Line → Stoptime → Reject/OEE/Detail Produksi → Export → Settings (11 section) → Login/akses/device/kiosk. Semua sumber dummy mockup diganti API. Tiap halaman: loading/kosong/error/forbidden/On Hold.

**Gerbang otomatis internal (bukan menunggu user):** setelah setiap tahap B–E jalankan `npm run verify`. Gagal → perbaiki dulu. Setelah 3 percobaan gagal pada satu masalah: catat di `docs/BLOCKERS.md`, lanjutkan pekerjaan yang tidak bergantung padanya, dan laporkan di akhir. **Jangan melompati kegagalan diam-diam dan jangan menonaktifkan tes agar hijau.**

**Tahap F — Verifikasi akhir (G4–G6):**
- Tes jalur kritis: invariant INV-001..008, otorisasi (401/403 per endpoint × role × custom role, akses lintas objek), kode pairing (kedaluwarsa, pemakaian ulang, balapan 2 permintaan bersamaan → hanya satu sukses; cek **keadaan DB akhir**), konflik optimistic locking (409), idempotensi ekspor/push-sync, snapshot basi tidak menimpa yang baru, On Hold tidak melakukan request keluar.
- Screenshot Playwright vs mockup (terang/gelap; 1440, 1024 iPad, 390 mobile) per halaman.
- Performa: `EXPLAIN (ANALYZE)` untuk query agregasi bulanan & breakdown pada fixture berskala realistis; catat hasil, tambahkan indeks hanya bila terukur perlu.
- Keamanan: `npm audit`, review header/CORS/cookie/CSRF, redaksi log, rate limit login.
- Dokumen: `docs/` sesuai struktur panduan bagian 18 (hanya yang relevan), `docs/06-testing/test-results.md` (hasil **nyata**), `docs/07-deployment/{deployment,rollback-recovery}.md` (mis. Node + pm2/systemd; Docker hanya bila ada alasan), `docs/08-operations/{monitoring,alerts,troubleshooting}.md`, `docs/03-database/backup-recovery.md` (rencana backup DB dashboard + uji restore — **tandai belum teruji** bila belum), `docs/10-compliance/compliance-matrix.md`.
- `docs/FINAL_REPORT.md` memakai format respons panduan (Bagian 23) + status G0–G7 jujur + daftar yang **tidak bisa diverifikasi di lingkungan ini** (mis. DB ConMas asli, perbandingan dengan i-Reporter, restore produksi, push-sync nyata) + langkah uji manual untuk user.
- Sediakan `scripts/compareWithIReporter.ts` (bandingkan dashboard vs CSV i-Reporter yang ditempel user → laporan selisih).

**Tahap G — Subcont (HOLD, jangan dikerjakan).**

## 7. Meniru mockup 1:1 (wajib)

1. **Ekstrak, jangan menggambar ulang**: ambil CSS (`<style>` termasuk token `:root` terang/gelap, template monitoring), ikon (`window.dashboardIcon`, `ic()`), struktur DOM. Font DM Sans (base64 di mockup) → ekstrak ke `apps/web/public/fonts/*.woff2` + `@font-face` biasa.
2. Pelajari JS mockup per halaman (`NAV`, `drawNav`, state `S`, date picker `pk*`, `exportWorkbook`/`exSel`, `SETTINGS_SPEC/GROUPS/SECTIONS`, `demoRoles`, `allowedRoute`, kalender kerja, mode meeting, kiosk/paired-device) dan port ke komponen React yang menghasilkan **DOM, class, dan teks yang sama**.
3. Semua dummy mockup (`snapshot-data`/`SOURCE_BOOK`, `demoSettings`, `demoRoles`, `localStorage` demo, `demoLossEvents`, nama `41HR121`, dst) **diganti API**. Bentuk data mockup (Bagian 8) = kontrak respons.
4. Pertahankan aksesibilitas mockup (aria-label, `aria-current`, focus ring, status = ikon + teks).

## 8. Kontrak data yang dipakai mockup

`SOURCE_BOOK`: `lines[]` `{line, site, product, monthly, actual, toDate, gap, hours, days, dailyTarget, daysOutput[]}`; `reports[line][hari]` → `[{row, shift, shiftLabel, actual, plan, availability, performance, quality, categories[5] (Machine, Man, Material, Method, Other), change, items[[produk, kode, MO, qty]]}]`; `calendars[site][bulan]` → boolean per hari; `cutoffs[site]` → hari terakhir data valid. Perluas bila LOGIC_SPEC butuh (status line, hourly), **jangan hapus** field yang dipakai UI.

## 9. Kapan boleh bertanya / berhenti

Hanya jika jawabannya mengubah desain secara material **dan** tidak bisa diasumsikan aman:
- berkas masukan Bagian 0 tidak ada;
- kredensial/akses yang memang dibutuhkan untuk langkah tertentu tidak tersedia (mis. DB ConMas asli) → pakai fixture dev, tandai "belum diverifikasi dengan data asli";
- hal ⚠️ di LOGIC_SPEC (satuan jam/menit, rumus Sogo/Shugyo/Kikai/PPM bulanan, total reject P027+P028+M107, persen 0.95 vs 95) → **jangan menunggu**: implementasikan perilaku lama yang tertulis, bungkus di satu fungsi yang mudah diganti, label UI "belum divalidasi", catat di OPEN_QUESTIONS.

## 10. Definisi selesai

Sesuai panduan Bagian 25–26, dan: screenshot nyaris identik dengan mockup; tidak ada dummy di build production; rumus identik LOGIC_SPEC dan tes hijau; endpoint tulis dilindungi + tercatat di audit log; `npm run verify` hijau; tidak ada secret di git; `FINAL_REPORT.md` jujur tentang apa yang belum terbukti.
