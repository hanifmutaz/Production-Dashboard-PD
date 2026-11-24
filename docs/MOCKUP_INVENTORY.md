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

## Status port per halaman
| Halaman | Fungsi mockup | Status | Bukti |
|---|---|---|---|
| Login | `#demo-login` | ✅ (role demo → username/password; pairing iPad nyata) | paritas 0 diff, screenshot |
| Shell (sidebar/rail/drawer/header/tema/layar penuh/profil) | `drawNav`, `syncThemeButtons`, `setDrawer` | ✅ | paritas 0 diff |
| Executive + edit target + Kalender Kerja | `executiveView`, `executiveTargetForm`, `drawWorkCalendar` | ✅ | paritas 0 diff, uji alur browser |
| Master Hub | `V.hub`, `hubDaily`, `hubMonthly`, `pickHtml` | ⏳ | — |
| Master Dashboard lokasi | `masterView` | ⏳ | — |
| Stoptime | `V.stoptime` | ⏳ | — |
| Monitoring Output | `production-monitoring` (web component + template) | ⏳ | — |
| Pilih Line / Detail Line (kiosk) | `V.lines`, `V.line` | ⏳ | — |
| Export | `exportView` | ⏳ | — |
| Settings (11 section) | `settingsView` | ⏳ | — |

## Penyimpangan dari mockup yang disengaja (perlu diketahui user)
1. Login: pilihan role demo diganti username + password (wajib, login asli). Field baru memakai gaya field pairing mockup.
2. Executive: SGP/Systech tampil **On Hold** (label di bawah nama lokasi, semua angka "—"), bukan angka demo.
3. Executive editor: input **"Waktu masuk"** tidak ditampilkan — jam shift diatur lewat env server, bukan per lokasi dari UI.
4. Tombol "Simpan (demo)" → "Simpan".
5. Split "s/d kemarin + hari ini" (OQ-014) **belum ditampilkan**: layout mockup tidak punya tempatnya, jadi UI memakai angka kumulatif lama (inklusif hari ini). Data split sudah tersedia di API — tunggu keputusan user.
