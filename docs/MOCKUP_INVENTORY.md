# MOCKUP INVENTORY — **PARSIAL** (diperbarui sesi 3)

> Inventaris lengkap per halaman/dialog/state **belum dikerjakan** — wajib sebelum Tahap E. File mockup tidak ada di ZIP ini (BLK-006); upload ulang `Dashboard-Produksi-Hirose-Industrial-Velvet-DMSans-Fix.html`.

## Navigasi (`NAV`)
- **Overview:** `executive` Executive Dashboard · `hub` Master Hub
- **Lokasi:** dari `KS` (internal/sgp/systech) → `master-<lokasi>`
- **Produksi:** `monitoring-output` Monitoring Output per Line · `lines` Pilih Line (→ `line-<kode>`)
- **Data:** `export` Export Data (bila boleh ekspor)
- `settings`. Route lain: `stoptime-*`, `defect-*`, `product-*`. Routing hash `#<route>`; `allowedRoute()` membatasi Custom Role & perangkat pairing.

## Settings (`SETTINGS_SECTIONS`, 11 section)
`general` Identitas · `master` Master Produksi · `planning` Target Produksi · `kpi` KPI & Ambang · `calendar` Shift & Kalender · `loss` Downtime & Defect · `source` Integrasi i-Reporter · `access` Pengguna & Akses · `display` Tampilan & Ekspor · `alerts` Peringatan · `audit` Riwayat & Backup.

Setting baru dari keputusan OQ yang perlu tempat di UI (tanpa mengubah desain; pakai pola form yang sudah ada di mockup):
- `line_status` (syarat Running + cek stale) → kandidat section **`kpi` KPI & Ambang** atau **`source` Integrasi i-Reporter** — **perlu persetujuan user**.
- `line_discovery` (default line baru) → section **`master`** sub **Line**.

## Akses (dummy di mockup → API)
`demoRoles`, `customRoles`/`devices` di localStorage, `sessionStorage.cmDemoRole`, `canExportDemo()` → diganti `/api/v3/auth/*`, `/api/v3/access/*`, permission `export.run`.

## Struktur file mockup (hasil bedah sesi 3)
- 15 blok `<style>`: 13 global + 2 di dalam `<template id="monitoring-template">` (shadow DOM komponen `production-monitoring`).
- Aset base64: logo PNG (1,3 KB), foto login WebP (169 KB), font DM Sans woff2 (89 KB) → `apps/web/public/`.
- JS ±330 KB: renderer string-template; `V` = peta rute → fungsi HTML; `render()` membaca `location.hash`.
- Rute: `executive`, `hub`, `master-<lok>`, `stoptime-<lok>`, `monitoring-output[-<lok>]`, `lines`, `line-<kode>`, `export`, `settings` (+ `defect-*`, `product-*`). Judul halaman dari `PAGE_HEADINGS`.

## Status port per halaman (sesi 4: semua halaman)
| Halaman | Fungsi mockup | Sumber data V3 | Bukti |
|---|---|---|---|
| Login | `#demo-login` | `/auth/login`, `/auth/pair` | paritas, alur |
| Shell | `drawNav`, `syncThemeButtons`, `setDrawer`, `allowedRoute` | `/auth/me` (menus, line) | paritas, alur (Custom Role) |
| Executive + edit target + Kalender Kerja | `executiveView`, `drawWorkCalendar` | `/executive/*` | paritas, alur |
| Master Hub (Harian/Bulanan) | `V.hub`, `hubK`, `hubT`, `hubLocationCharts`, `<hub-output-trend>` | `/reporting/summary/range`, `/trend/range` | paritas, alur |
| Master Dashboard lokasi | `masterView`, `masterTrend`, `masterLineTable` | `/summary/range`, `/trend/range`, `/line-metrics`, `/summary/current` | paritas, alur |
| Stoptime | `V.stoptime`, `stRows` | `/summary/range`, `/line-metrics`, `/stoptime` | paritas, alur |
| Monitoring Output (shadow DOM) | `<production-monitoring>` + `<template>` | `/lines`, `/planning`, `/line-metrics?perDay`, `/reports`, `/stoptime`, `/executive/calendar` | paritas (di dalam shadow root), alur |
| Pilih Line | `V.lines` | `/lines` | paritas |
| Detail Line / kiosk iPad | `V.line`, `lnData`, `lnRange`, `lc` | `/line-detail`, `/line-metrics`, `/reject` | paritas, alur (live, rentang, iPad) |
| Export | `exportView`, `exportBuilder`, `exPreview`, `DS` | `/export/preview`, `/export`, `/export/templates` | paritas, alur (unduh) |
| Settings (11 section) | `settingsView`, `settingsList`, `settingsEditor`, `rolePanel`, `devicePanel` | `/settings`, `/lines/all`, `/planning`, `/access/*`, `/executive/calendar` | paritas, alur |

## Penyimpangan dari mockup yang disengaja
1. **Login**: pilihan role demo → username + password (login asli).
2. **SGP/Systech**: tampil **On Hold** (angka "—"), tidak ada angka demo.
3. **Sogo/Shugyo**: mockup menampilkan "kadoritsu (%)"; data asli berupa **menit** (OQ-007b) → label "Sogo"/"Shugyo", nilai `x m`, tanpa warna band.
4. **Deviasi**: label "Kurang (Plan − Actual)" / "Deviasi (Plan − Actual)" (OQ-006). "Gap" Executive & Monitoring tetap Actual − Target (sama dengan mockup).
5. **Executive**: input "Waktu masuk" tidak ada (jam shift dari .env). Split s/d kemarin (OQ-014) belum ditampilkan — data tersedia di API.
6. **Monitoring Output**: kolom "Jam shift" → skema shift ("2 sh"); target line dari Settings → Target Produksi; bila line tanpa target, warna sel harian memakai plan harian dari laporan i-Reporter; bulan = bulan berjalan; dialog kalender hanya Hirose Internal.
7. **Detail Line**: nama Cell Leader/Teknisi/Inspector dari laporan; NIK & foto belum ada sumbernya ("—"); QR "belum tersedia" (sama dengan mockup). Bar simulasi prototype (`.sim`) dihapus. OEE pada mode live/harian = OEE berbobot **bulan berjalan** (tidak ada OEE per shift yang tervalidasi).
8. **Export**: file dibuat di server; checkbox BOM dihapus (BOM sudah melekat pada pilihan "CSV untuk Excel"); kolom "CL No/Product No" dataset Stoptime tidak ada (tidak ada sumbernya); template tersimpan per akun di server.
9. **Settings**: Identitas tanpa unggah logo/foto (belum didukung). Lokasi & Shift **hanya lihat** (lokasi tetap 3; jam shift dari .env). Hak akses = matriks izin role (role bawaan tidak bisa diubah). Kalender Kerja = daftar libur bulan terpilih + dialog kalender. Kartu tambahan: **Status line** (KPI & Ambang, OQ-011/012) dan **Line baru dari i-Reporter** (Master → Line, OQ-017). Section awal = KPI & Ambang (sama dengan mockup).
10. **Custom Role**: tanpa field Deskripsi (tidak disimpan). Izin = lihat dashboard + Mode Meeting (+ ekspor bila menu Export dipilih).
