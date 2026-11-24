# MOCKUP INVENTORY — **PARSIAL**

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
