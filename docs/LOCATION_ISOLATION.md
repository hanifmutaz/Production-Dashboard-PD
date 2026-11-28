# Location Isolation & Adaptive UI

Base: `d030e5a079b774ce795516c483172ec647f0800d`. Includes the upstream commits through `ff713647ac42c373ca58f07ccd82df26b74ee427`.

## Policy

- Hirose pusat: scope eksplisit `internal`, `sgp`, `systech` (semua).
- SGP: hanya `sgp`. Systech: hanya `systech`. `internal` saja juga didukung bila akses sengaja dibatasi.
- Scope kosong atau campuran dua lokasi ditolak. Jangan mengasumsikan semua akun lama dengan scope kosong milik Hirose.
- Role tetap menentukan aksi. Scope menentukan data yang boleh diakses. Admin lokasi tidak boleh mengelola akun atau perangkat lokasi lain, atau memberikan role dengan izin yang lebih tinggi.
- Persetujuan registrasi, definisi custom role, konfigurasi global, discovery ConMas internal dan audit global hanya dikelola Hirose pusat. Admin lokal dapat mengelola target, kalender/shift, line, akun dengan role yang diizinkan dan perangkat line sendiri sesuai izin.
- TV departemen tetap internal-only. Mekanisme push dan kredensial sinkronisasi subcont tidak diubah.

## Apply dan trial

1. Backup database dashboard dan `.env`. Stop aplikasi sebelum penetapan scope akun.
2. Pastikan working tree bersih dan base commit sesuai. Simpan patch di luar repo.
3. `git switch -c fix/location-isolation`
4. `git apply --check PATH_TO_PATCH`
5. `git apply PATH_TO_PATCH`
6. `npm ci --include=dev`
7. `npm run format`
8. `npm run verify` (jangan lanjut deployment bila ada kegagalan).
9. Jalankan penetapan scope per akun yang sudah diverifikasi identitas/lokasinya, sebelum aplikasi hasil patch diaktifkan:

```powershell
node --env-file=.env --import tsx scripts/setUserScope.ts "EMAIL_ADMIN_HIROSE" hirose
node --env-file=.env --import tsx scripts/setUserScope.ts "EMAIL_USER_SGP" sgp
node --env-file=.env --import tsx scripts/setUserScope.ts "EMAIL_USER_SYSTECH" systech
```

Ganti email contoh. Ulangi untuk akun existing yang memerlukan scope. Script menggunakan database dashboard yang ditunjuk `.env`, bukan database ConMas. Scope baru berlaku setelah login ulang. Sesi dan kode pairing belum terpakai dari akun tersebut dicabut. Akun tanpa scope tidak dapat login sampai diatur. Akun baru harus dipilih scope eksplisit saat dibuat/disetujui. `createAdmin.ts` memberi scope pusat hanya pada admin baru yang dibuat lewat script operator.

Migration upstream 1732800000000_user_registration.sql harus diterapkan dengan npm run db:migrate sebelum menjalankan aplikasi. Tidak ada migration schema khusus isolasi: tabel `user_site_scope` sudah ada. Perangkat lama tanpa scope valid atau lokasi line tidak cocok perlu pairing ulang.

## Acceptance test sebelum dibuka ke subcont

- Login Hirose pusat: tiga lokasi terlihat; KPI, ranking, perbandingan, tab, export dan pengaturan lokasi tersedia sesuai role.
- Login SGP, lalu Systech: tidak ada nama, tab, kartu, status, legenda atau filter untuk lokasi lain di Executive, Hub, Master, Monitoring Output, Stoptime, Export dan Settings; chart/section tidak menyisakan placeholder lokasi lain.
- Pastikan line list, pencarian, detail line, KPI, kalender dan target hanya milik lokasi login. Test manipulasi hash dan request API langsung; akses data lain harus ditolak backend.
- Test preview dan download export lintas lokasi dengan request API yang dimodifikasi, serta edit/delete master line, target, shift, akun dan pairing di luar scope.
- Test akun kosong, perubahan scope saat sesi aktif, pergantian akun di browser, role viewer/admin, serta pairing iPad. Pastikan fitur TV yang lama tetap bekerja.
- Uji push data SGP/Systech dan cek angka terhadap ConMas tiap lokasi; Hirose harus tetap menerima seluruh data.
- Review `git diff`, hasil verify, dan hasil trial nyata sebelum commit/deploy. Patch ini bukan bukti runtime sudah lulus.

## Rollback

Stop aplikasi. Kembali ke branch lama atau revert commit patch. Pulihkan backup DB jika perubahan scope perlu dikembalikan. Jangan buka akses subcont pada versi lama yang menganggap scope kosong sebagai akses global.
