# Trial push SGP dan Systech ke Hirose

Gunakan Node 24 dan PowerShell dari root checkout Production-Dashboard-PD. Patch ini berbasis commit 0c0857c5. Setiap lokasi menjalankan satu pengirim baru dari folder trial tersendiri. Dashboard lama dan pengirim sebelumnya bisa berjalan selama trial.

## 1. Pasang patch di laptop

Dari checkout Production-Dashboard-PD, dengan file patch ada di Downloads:

```powershell
git fetch origin
git worktree add -b trial/subcont-v3 ../PD-subcont-trial 0c0857c5
Set-Location ../PD-subcont-trial
$patch = Join-Path $HOME 'Downloads/PD-subcont-v3.patch'
git apply --check "$patch"
if ($LASTEXITCODE -eq 0) { git apply --index "$patch" }
git diff --cached --stat
```

Setelah daftar file benar, commit dan bagikan branch trial ke tiga server:

```powershell
git commit -m "Trial push produksi SGP dan Systech"
git push -u origin trial/subcont-v3
```

Pada masing-masing server, jalankan dari folder induk yang sesuai:

```powershell
git clone --branch trial/subcont-v3 --single-branch https://github.com/hanifmutaz/Production-Dashboard-PD.git PD-subcont-trial
Set-Location PD-subcont-trial
npm.cmd ci --include=dev
```

## 2. Siapkan penerima Hirose

Di checkout trial Hirose saja, buat .env dari .env.example jika belum ada. Salin mapping Hirose yang sudah digunakan ke config/reportColumns.js di folder trial. Isi koneksi ConMas Hirose dengan akun baca dan arahkan DASHBOARD_DATABASE_URL ke database dashboard trial yang terpisah. Database trial memerlukan akun dashboard untuk login. Jika memakai salinan database dashboard, akun dan master pada salinan itu dapat dipakai.

Di .env trial atur PORT=3010 (atau port bebas), SOURCE_NAME=internal, SUBCONT_ENABLED=true, SYNC_STALE_AFTER_SEC=300. Isi SYNC_KEY_SGP dan SYNC_KEY_SYSTECH dengan dua kunci berbeda yang hanya dibagikan ke server masing-masing. Untuk mencoba satu lokasi dulu, kosongkan kunci lokasi lainnya. Pertahankan tanggal PRODUCTION_MODE_FROM khusus Hirose yang sudah berlaku.

```powershell
npm.cmd run db:migrate
if ($LASTEXITCODE -eq 0) { npm.cmd start }
```

Pada terminal lain cek `Invoke-RestMethod http://localhost:3010/readyz`. Tunggu status ok. Arahkan hostname HTTPS trial di tunnel Hirose ke server trial tersebut. Pengirim memakai URL lengkap hostname trial dengan path /api/sync. Sinkronkan jam Windows ketiga server agar urutan koreksi snapshot tepat.

## 3. Siapkan pengirim di setiap subcont

```powershell
if (!(Test-Path .env.subcont)) { Copy-Item .env.subcont.example .env.subcont }
notepad .env.subcont
```

| Server | SOURCE_NAME | View yang dibaca otomatis | Nilai PUSH_SYNC_KEY |
| --- | --- | --- | --- |
| SGP | sgp | view_report_1127 | Sama dengan SYNC_KEY_SGP di Hirose trial |
| Systech | systech | view_report_1677 | Sama dengan SYNC_KEY_SYSTECH di Hirose trial |

Isi CONMAS_DATABASE_URL dengan akun yang punya SELECT pada view produksi lokal dan PUSH_MASTER_URL dengan URL HTTPS trial. Encode karakter khusus dalam username/password pada URL PostgreSQL. File .env.subcont bersifat lokal. Proses pengirim membaca ConMas dan mengirim keluar. Ia tidak membutuhkan database dashboard lokal, migrasi, atau port masuk.

## 4. Cocokkan dua tanggal sebelum mengirim sebulan

Di setiap server subcont, dari root checkout trial:

```powershell
npm.cmd run subcont:push -- 2026-11-26 2026-11-27
```

Perintah ini berhenti setelah rentang selesai. Per hari, cocokkan jumlah report produksi dan total actual pada log dengan view setempat. Pada 26 November flag kosong dan true bisa masuk untuk kode line produksi valid. Mulai tanggal produksi 27 November hanya true masuk. Kode lama dengan satu huruf setelah angka digabung ke line induk, reinspect dikecualikan, dan actual 0 tetap sah. Jam registrasi tidak menentukan tanggal aturan.

Pada dashboard trial cek data harian SGP dan Systech secara terpisah. Kirim rentang yang sama dua kali dan pastikan output tidak bertambah jika nilai sumber sama. Bila ada koreksi report, bandingkan ulang terhadap view. Untuk memvalidasi bulan November kirim semua tanggal termasuk hari libur, misalnya:

```powershell
npm.cmd run subcont:push -- 2026-11-01 2026-11-27
if ($LASTEXITCODE -eq 0) { npm.cmd run subcont:push }
```

Sesuaikan tanggal akhir dengan hari trial. Mode berkelanjutan memperbarui hari ini dan kemarin setiap siklus serta mengejar tanggal yang terlewat sejak awal pengoperasian. Gunakan rentang manual untuk revisi yang lebih lama. Untuk menjalankan otomatis di Windows Task Scheduler, gunakan akun yang bisa membaca .env.subcont, trigger saat startup, program cmd.exe, argumen /c npm.cmd run subcont:push, dan Start in berupa path absolut root checkout trial. Pastikan npm.cmd ada pada PATH akun task, aktifkan restart setelah gagal, dan jalankan satu instance per lokasi.

## 5. Atur jam dan validasi operasional

Di Settings → Shift & Kalender pilih lokasi. Isi jam shift pagi, Jumat, malam dan skema tiga shift sesuai jadwal lokasi. Offset slot i-Reporter mengatur label jam pada grafik per jam. Di Kalender Kerja pilih lokasi dan bulan sebelum mengubah hari libur. Bandingkan satu report shift malam lintas tanggal, output per shift, dan target sampai tanggal berjalan dengan i-Reporter. Atur target per lokasi dan per line melalui Target Produksi.

Jika situs On Hold, cek SUBCONT_ENABLED dan apakah kunci situs sudah diisi di Hirose. Jika data belum tersedia, periksa tanggal snapshot dan waktu push terakhir. HTTP 401 menandakan kunci tidak cocok, 503 bisa berarti receiver sedang On Hold, dan 413 berarti snapshot melampaui batas request. Batas penerima adalah 10 MB per tanggal. Jika trial perlu dihentikan, hentikan task/proses pengirim baru dan proses penerima trial. Simpan snapshot serta log trial untuk pencocokan.
