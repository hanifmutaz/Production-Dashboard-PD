# LOGIC SPEC — Dashboard-ConMas (lama) → dasar logika V3

Dokumen ini adalah ringkasan **perilaku dan rumus yang sudah terbukti jalan** di dashboard lama (`hirose-idn/Dashboard-ConMas`, backend Node/Express/PostgreSQL). V3 dibangun dari nol, tapi **logika di sini harus sama**. Kalau ada konflik antara dokumen ini dan mockup: **tampilan = mockup, logika/angka = dokumen ini**.

Tanda ⚠️ = hal yang belum terkonfirmasi. Jangan ditebak; catat di `docs/OPEN_QUESTIONS.md`.

---

## 1. Arsitektur data

- **Satu instance per lokasi** (Internal, SGP, Systech). Tiap instance punya backend + akses read-only ke DB ConMas lokalnya. Nama view beda per instance → env `DB_VIEW_NAME` (default `view_report_25415`).
- **Master = instance Hirose Internal.** Ia menggabungkan 3 lokasi. `internal` dihitung langsung dari DB lokal (tanpa HTTP). `sgp`/`systech` datang dari: (a) pull HTTP (`/api/external/*`, API key) sebagai jalur utama, (b) **push-sync** sebagai fallback.
- **Push-sync (jalur yang sekarang dipakai):** instance SGP/Systech `POST` ke Master `/api/sync` tiap ±60 detik (outbound HTTPS lewat Cloudflare Tunnel; Hirose di belakang tunnel, makanya `app.set("trust proxy", 1)` wajib). Header `x-sync-key` dicocokkan dengan env `SYNC_KEY_<SOURCE>`. Body: `{ source, type, timestamp, data }`. Master menyimpan **snapshot terbaru per (source, type)** di database terpisah (`SYNC_DB_*`, bukan DB ConMas) dan menolak snapshot yang lebih tua dari yang tersimpan (guard `payload_timestamp`; respons tetap OK agar pengirim tidak retry selamanya). Pengirim punya antrian file lokal (maks 500, dedupe per type) + retry per siklus. Body limit 10 MB. Snapshot dianggap basi setelah ±5 menit.
- **Tahap ini: Hirose Internal saja.** SGP/Systech = **On Hold** (tampil "On Hold", tidak ada request, tidak ada angka 0 palsu). Struktur & flag harus tetap ada: `SUBCONT_ENABLED=false`.
- **Data konfigurasi** (di dashboard lama berupa file JSON di `data/`, di V3 pindah ke tabel DB dashboard): `lines`, `executiveTargets`, `executiveCalendar`. **Jangan menimpa data lama**: sediakan skrip impor dari `lines.json`, `executiveTargets.json`, `executiveCalendar.json`.
- **DB ConMas read-only.** Tabel baru (user, role, device, audit, settings) harus di database dashboard sendiri.

## 2. Waktu & shift (kritis)

- Semua perhitungan "sekarang" pakai **WIB = UTC+7**: `wib = new Date(Date.now()+7*3600*1000)` lalu baca pakai `getUTC*`. Semua parsing tanggal **UTC eksplisit** (`Date.UTC`), iterasi hari pakai `setUTCDate`. (Bug lama: parse tanpa "Z" menggeser tanggal mundur 1 hari di server WIB.)
- Kolom `tanggal` (`cluster_1_44_d`) = timestamp **naive**. Filter tanggal pakai `DATE(kolom)` polos, **tanpa** `AT TIME ZONE`.
- Kolom shift (`cluster_1_68_t`) berisi teks seperti `"Shift 2 (3 Shift)"`. Parse dengan regex `/Shift\s*(\d)\s*\((\d)\s*Shift\)/i` → `{shiftNum, scheme}`. Teks rusak/kosong → abaikan untuk perbandingan jam tapi baris tetap dianggap "ada data".
- Tiap line punya `shift_scheme` (2 atau 3). Jam shift **semuanya lewat env, tidak ada hardcode**:

| Env | Default Internal | Arti |
|---|---|---|
| `SHIFT2_START_HOUR` | 7 | mulai Shift 1 (2-shift) |
| `SHIFT2_END_HOUR_WEEKDAY` | 16 | akhir Shift 1 Senin–Kamis, Sabtu/Minggu |
| `SHIFT2_END_HOUR_FRIDAY` | 17 | akhir Shift 1 hari Jumat |
| `SHIFT2_NIGHT_START_HOUR` | 22 | mulai Shift 2 (malam), lewat tengah malam sampai `SHIFT2_START_HOUR` |
| `SHIFT3_START_HOUR` / `SHIFT3_SECOND_START_HOUR` / `SHIFT3_THIRD_START_HOUR` | 6 / 14 / 22 | tiga shift; Shift 3 lewat tengah malam |
| `LINE_NOT_RUNNING_THRESHOLD_MIN` | 120 | batas "tidak running" di tengah shift |
| `LINE_START_GRACE_MIN` | = threshold di atas | masa tunggu awal shift sebelum dianggap tidak running |
| `HOURLY_SLOT_OFFSET` | 0 | pergeseran slot-1 jam dari baseline jam 6 |

- Celah antar shift (2-shift, 16/17:00–22:00): tampilkan Shift 1 yang baru selesai.
- **`resolveShiftAndDate(nowWIB, scheme)`** → `{shift: "Shift N (S Shift)", tanggal, shiftStartWIB}`. Shift yang melewati tengah malam dicatat di **tanggal kemarin** (`useYesterday`) saat jam < jam mulai pagi.
- **`shiftWindowFromLabel(calendarDate, scheme, shiftNum)`** → `{startWIB, endWIB}` dari tanggal baris + label (shift lintas hari: `endNextDay`; Jumat memakai `SHIFT2_END_HOUR_FRIDAY`).
- **`pickActiveRow(rows, nowWIB, shiftCol, exactDate?, shiftOverride?)`** memilih satu baris "kondisi sekarang" dari kandidat (baris line itu untuk **hari ini + kemarin**):
  1. Mode live: baris yang jendela waktunya (dari **teks shift baris itu sendiri**, bukan tebakan konfigurasi) mencakup sekarang.
  2. Tidak ada yang cocok (celah): baris yang paling baru selesai.
  3. Mode historis (`?date=YYYY-MM-DD`, dan `?shift=N` opsional): hanya baris yang tanggalnya persis cocok; kalau ada >1 baris di tanggal itu → yang jendela akhirnya paling akhir; bila `shift` diberikan → harus persis shift itu, kalau tidak ada kembalikan `null` (bukan shift lain). Baris yang tanggalnya tidak cocok **tidak boleh** ditampilkan sebagai tanggal yang diminta (`enforceExactDateIfHistorical`).
  - Mode historis dijalankan dengan menganggap "sekarang" = `${date}T23:59Z`.
- **Status line 3-state `getLineStatus3`**:
  - tidak ada baris & elapsed ≤ `LINE_START_GRACE_MIN` → `waiting`
  - tidak ada baris & elapsed > grace → `not_running`
  - ada baris & `isRowStale` → `not_running`
  - ada baris & tidak stale → `running`
  - historis: `no_data` / `shift_not_found`
- **`isRowStale(hourly, shiftStartWIB, now, threshold)`**: iterasi slot jam dari awal shift (maks 20) selama `slotStart < now − threshold`; bila ada slot "due" tetapi **semua** `output_actual` slot due itu null → stale. Label jam: `hourToLabel(h)` = `"HH-(HH+1)"` dua digit; jam 0 → `"24-1"`, jam 23 → `"23-24"`.
- `getShiftSlotLabels(scheme, shiftNum, dow)`: urutan label jam untuk satu shift (mod 24), dipakai untuk menampilkan tabel per jam hanya untuk jam milik shift itu.

## 3. Kolom & mapping

Lihat `reportColumns.example.js` (di paket ini) dan `view_columns.txt` (daftar header lengkap 1.034 kolom). Ringkas:
- Satu baris view = satu report (line × shift × tanggal) ⚠️ verifikasi.
- Semua nilai numerik dari view bisa string kosong → **selalu** pakai `COALESCE(NULLIF(TRIM(kolom::text),'')::numeric, 0)` di SQL agregasi. Di baris tunggal, `null`/kosong ≠ 0 untuk per-jam (null berarti belum diisi).
- **25 slot per jam** (`HOURLY_COLUMNS`) berurutan fisik, bukan jam absolut. Label jam = `(6 + index + HOURLY_SLOT_OFFSET) mod 24`. Slot index 0 dan 24 berlabel sama → **key lookup pakai index, bukan label** (bug lama: label bentrok menimpa jam pertama).
- **6 slot produk** (`PRODUCT_SLOTS`) terisi berurutan; produk aktif = **slot terakhir yang `cl_no`-nya terisi**.
- **150 slot defect/stoptime** (`REJECT_PAIRS`): tiap slot = Kategori, Masalah, Minute, Qty Reject M107, Nama Reject. Terisi sekuensial; filter slot kosong.
- Kategori stoptime 4M: **Machine, Man, Material, Method, Other**. Total per kategori ada di kolom `stoptime_*`; detail per kejadian dari 150 slot.

## 4. Rumus (sama persis dengan dashboard lama)

| Metrik | Rumus |
|---|---|
| Output Plan / Actual | kolom `output_plan` / `output_actual` (total report). Agregasi = **SUM** |
| Deviasi | `output_actual − output_plan` (dari output, **bukan** kolom DB) |
| Pencapaian per jam | `plan > 0 && actual != null ? round(actual/plan×100) : null`; deviasi per jam `actual − plan` |
| **Bekidoritsu** (output) | `output_actual / output_plan × 100`, 1 desimal, `plan = 0 → 0` (bulanan/range: dari **SUM** plan & actual) |
| **Operator Availability (Beki, per line live)** | `(output_actual + reject_m107) / output_plan × 100`, dibulatkan 1 desimal, `plan = 0 → null` |
| **Stoptime total** | `jam_target − jam_efektif` (kolom 2918 − 2919); agregasi = SUM masing-masing lalu selisih. ⚠️ satuan jam/menit belum terkonfirmasi |
| Reject (qty) | `reject_m107` (kolom 2917). ⚠️ apakah total reject juga memasukkan P027+P028 belum terkonfirmasi |
| OEE | kolom `oee` (85); agregasi lama = **AVG** atas baris yang punya data (1 desimal) ⚠️ rata-rata sederhana, bukan berbobot — pertahankan dulu agar angka cocok dengan dashboard lama, tandai di OPEN_QUESTIONS |
| Reject PPM | kolom `reject_ppm` (113) di tampilan line; agregasi bulanan ⚠️ belum dikonfirmasi (usul: `Σ reject / Σ output × 1.000.000`, **jangan rata-rata PPM**) |
| Sogo / Shugyo / Kikai kadoritsu | kolom 2924/2925/2926 per report; agregasi ⚠️ belum dikonfirmasi (usul berbobot jam, bukan rata-rata persen) |
| Persentase di DB | ⚠️ `0.95` atau `95`? Validasi dulu dengan sampel |

Agregasi level **line** (ranking, breakdown): query per line `WHERE line = $1 AND DATE(tanggal) BETWEEN $2 AND $3 GROUP BY DATE(tanggal)`. Level **semua line**: iterasi `getAllLines()` (hanya `active`), jumlahkan.

Ringkasan (`getLocalSummary`, shift berjalan) mengembalikan: `lines_total, lines_running, lines_not_running, output_plan, output_actual, qty_reject, stoptime_total, avg_oee`. `line_not_running` untuk line **tanpa baris** = `elapsed > threshold`; line yang punya baris dianggap running. Varian: `getLocalDailySummary(date)` (SUM semua shift satu tanggal; `line_not_running` hanya relevan untuk hari ini), `getLocalMonthlySummary(year, month)` (`EXTRACT(YEAR/MONTH)`), `getRangeTrend(start,end)` (per hari: plan, actual, stoptime, `hasData = !future && ada data`; totals: plan, actual, bekidoritsu, stoptime), `getDailyTrend(year,month)` = range sebulan penuh.

Hari tanpa data pada range: plan/actual = 0 tapi `hasData=false` (UI membedakan "tidak ada data" dari "0").

## 5. Executive Dashboard

- **Target bulanan per lokasi** diinput manual planner (`POST target {year, month, tempat, target, actual?}`), `tempat ∈ {internal, sgp, systech}`. **Actual otomatis** = `output_actual` bulanan dari sumber yang sama dengan Master Hub (`getLocalMonthlySummary` untuk internal). Cache actual 30 detik, kegagalan satu lokasi = actual 0 untuk lokasi itu (di V3: tampilkan On Hold/tidak tersedia, bukan 0).
- **Kalender kerja per bulan per lokasi**: default hari libur = Sabtu & Minggu; planner klik tanggal untuk toggle; tanggal di luar bulan dibuang; disimpan terurut unik.
  `workingDays = totalDays − liburDates.length`; `elapsedWorkingDays` = jumlah hari kerja sampai hari ini (WIB; bulan lampau = semua, bulan depan = 0).
- **Perhitungan pencapaian** per lokasi:
  - `dailyTarget = workingDays > 0 ? target / workingDays : 0`
  - `targetHariIni = round(dailyTarget × elapsedWorkingDays, 2)` (kumulatif)
  - `gap = actual − target`; `gapHariIni = actual − targetHariIni`
  - `achievementPct = target > 0 ? round(actual/target×1000)/10 : 0`; `achievementHariIniPct` sama terhadap `targetHariIni`
  - Total = **jumlah** nilai per lokasi (jangan dihitung ulang dari satu masa kerja gabungan).
- **Trend** `GET trend?year=&tempat?`: kumulatif target vs actual per bulan sepanjang tahun, 12 query paralel + cache; `tempat` kosong = jumlah semua lokasi.
- Plan harian satu line (monitoring output): `plan bulanan / hari kerja`; jam kerja per lokasi bisa diatur.

## 6. Halaman & endpoint lama → padanan V3

| Fungsi | Endpoint lama | Data |
|---|---|---|
| Detail line shift aktif | `GET /api/dashboard/?line=&date=&shift=` | respons di bagian 7 |
| Detail line bulanan | `/monthly` | trend harian satu line |
| Detail reject | `/reject-detail` | agregasi `REJECT_PAIRS` (nama defect + qty, urut terbesar) |
| Ranking semua line | `/summary-all`, `/summary-all-daily` | per line: plan, actual, reject, stoptime, oee, status |
| Per lokasi | `/summary-by-tempat`, `/monthly-summary`, `/summary-all-monthly` | |
| Trend | `/hourly-trend`, `/daily-trend`, `/monthly-trend`, `/range-trend` | |
| Breakdown per line (range bebas) | `/line-range-breakdown?start=&end=` | bagian 8 |
| Master (gabungan lokasi) | `/api/master/summary`, `monthly-summary`, `monthly-trend`, `tempat-trend`, `line-range-breakdown?source=` | internal lokal; sgp/systech On Hold |
| Executive | `/api/executive/month`, `/trend`, `POST /target`, `GET/POST /calendar` | bagian 5 |
| Line registry | `GET/POST/DELETE /api/lines`, `GET /discover`, `POST /sync` | bagian 9 |
| Push sync | `POST /api/sync`, `GET /api/sync/status` | bagian 1 |
| Eksternal (read-only, API key) | `/api/external/*` | tetap ada, tidak dipanggil saat On Hold |

URL state lama: `?view=master|hub|breakdown&tempat=&line=&source=&date=` — V3 pakai router sungguhan tapi **redirect URL lama** agar bookmark tidak mati.

## 7. Respons detail line (field yang dipakai UI)

`success, shift, tanggal, line_not_running, line_status, line, cell_leader_nama, pj_teknis_nama, inspector_nama, product_name, cl_no, cycle_time_swi, cycle_time_actual, output_plan, output_total, deviasi_target (= actual−plan), reject_qty, qty_reject_ppm, stoptime_total, stoptime_man, stoptime_machine, stoptime_material, stoptime_method, availability_operator, hourly[{slot, output_plan, output_actual, deviasi, pencapaian}], historical, available_shifts[]`.
Baris tidak ada: `{success:true, data:null, line_status, availability_operator:null, ...}` (bukan error).
Tabel per jam hanya menampilkan **label jam milik shift terpilih** (`getShiftSlotLabels`), diisi dari 25 slot hourly.

## 8. Breakdown per line (range)

Per line aktif (opsional filter lokasi): `{line_code, product_name, tempat, output_plan, output_actual, qty_reject, bekidoritsu, deviasi (= plan − actual ⚠️ perhatikan: di breakdown lama deviasi = PLAN MINUS ACTUAL, kebalikan deviasi detail line; pertahankan lalu tandai), days[{date, plan, actual, hasData}]}` + `dates[]`. `product_name` = produk live dari **baris terbaru line itu (tidak dibatasi range)**, slot terakhir yang terisi. Kegagalan lookup produk → `null` ("—"), tidak menggagalkan tabel.

## 9. Line registry

`{line_code, description, shift_scheme (2|3), tempat (Internal|SGP|Systech), active}`. `GET` hanya yang aktif, urut `line_code`. `POST` validasi: `line_code` tak kosong (karakter `A-Za-z0-9_-`), `shift_scheme ∈ {2,3}`, `tempat` valid. `DELETE /:line_code` = nonaktifkan. **Auto-discovery**: `GET /discover` membaca `SELECT DISTINCT line FROM view` yang belum terdaftar dan `POST /sync` mendaftarkannya.

## 10. Aturan UI yang menempel ke logika

- Ambang pencapaian (default, bisa diubah di Settings → KPI & Ambang): kuning ≥ **90%**, hijau ≥ **100%**; OEE 85, Sogo 85, Shugyo 85, PPM 500. Band dihitung dari nilai yang **sudah dibulatkan 1 desimal** (warna dan angka berubah di batas yang sama). Status selalu ikon + teks, bukan warna saja ("Tercapai", "Mendekati target", "Di bawah target", "Tanpa target / data").
- PPM: skor pencapaian = `ppm == 0 ? green : min(1000, targetPpm/ppm×100)`.
- Angka: locale `id-ID`, `tabular-nums`, `—` untuk null.
- Sinkron UI: refresh default 60 detik, data dianggap basi setelah 15 menit (Settings → Integrasi i-Reporter).
- Kontrol akses: Viewer (lihat + Mode Meeting), Supervisor (lihat, investigasi, ekspor), Admin (edit konfigurasi, ekspor), plus Custom Role (menu & aksi), cakupan lokasi, device pairing iPad (kiosk read-only).
