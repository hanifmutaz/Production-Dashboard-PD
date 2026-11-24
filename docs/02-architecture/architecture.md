# G2 — Arsitektur

Modular monolith, npm workspaces:

```
packages/shared   fungsi murni: shift, waktu WIB, rumus, syarat Running, kalender kerja, band, format, kontrak API
apps/api          Express: routes → service → repository
  modules/reporting    baca ConMas (read-only)
  modules/executive    target, kalender, pencapaian (+ split s/d kemarin / hari ini)
  modules/masterData   line registry (+discovery, default dari Settings)
  modules/settings     settings versioned + SettingsService (line_status, line_discovery, config.*)
  modules/planning     target per line (line_targets) + baca target lokasi
  modules/auth         login, sesi, pairing
  modules/access       user, role, custom role, device, audit view
  modules/export       ekspor server-side + template
  modules/audit        audit log
  modules/sync         penerima PUSH subcont (off default)
apps/web          React 19 + Vite 8 (tanpa UI kit). CSS mockup diekstrak verbatim.
  src/styles/mockup.css               13 blok <style> global mockup, urutan asli
  src/styles/monitoring-template.css  2 blok <style> dari <template id="monitoring-template"> (khusus Monitoring)
  src/iconData.ts                     objek IC mockup (45 ikon) + ic() → <Icon/>
  src/lib/*                           api, auth, router hash, tema, format, achievement
  src/shell/Shell.tsx                 sidebar/rail/drawer/header/tema/layar penuh/profil
  src/components/*                    port helper mockup (sec, kp2, tcard, m4, pickHtml, hub-output-trend, lc)
  src/pages/*                         satu file per halaman mockup (settings/ = 11 section)
```

## ADR ringkas
- **ADR-001 Stack:** Node ≥20, Express 4, pg, zod 4, argon2, pino, TS strict, vitest.
- **ADR-003 Session/auth:** token opak 32 byte di cookie httpOnly SameSite=Strict; hanya hash SHA-256 disimpan; CSRF = header `x-v3-csrf: 1`. Kiosk: `Authorization: Device <token>`, selalu read-only.
- **ADR-004 Optimistic locking:** kolom `version`; tanpa version = INSERT (duplikat → 409); dengan version = `UPDATE ... WHERE version = $v` (0 baris → 409).
- **ADR-005 Snapshot push-sync:** satu baris per (source, type), upsert kondisional; snapshot tua → 200 `accepted:false`.
- **ADR-006 Pemisahan DB:** ConMas hanya SELECT lewat `ConmasReader`; data aplikasi di DB dashboard (migrasi SQL).
- **ADR-007 On Hold:** dicek di route sebelum repository → tanpa query keluar; `200 {data:null, status:'on_hold'}`.
- **ADR-008 Agregasi grouped:** satu query `GROUP BY line, DATE(tanggal)`; OEE berbobot & anomali dihitung di SQL dengan `CASE`.
- **ADR-009 Guard kolom runtime:** kolom mapping yang belum ada di view dibaca `NULL` + warning saat start.
- **ADR-010 Settings yang memengaruhi logika (baru):** hanya kunci `line_status` dan `line_discovery` yang divalidasi ketat (zod `.strict()`); nilai tersimpan yang rusak → pakai default (tidak crash). Dibaca per request (tabel kecil). Kunci lain disimpan bebas untuk UI.
- **ADR-011 Status line tunggal (baru):** `ReportingService#liveStatus` dipakai detail line & ringkasan, agar status tidak saling bertentangan. Perbedaan hanya lewat setting `staleInSummary`.
- **ADR-002 Router/state frontend (baru):** router **hash** buatan sendiri (`lib/router.ts`), bukan React Router. Alasan: mockup memakai hash (`#executive`, `#line-41hr121`) sehingga URL & bookmark identik; React Router juga tidak tersedia offline. State lokal per halaman (`useState`), sesi dari `AuthProvider` (`/api/v3/auth/me`). URL lama `?view=` diarahkan ke hash baru.
- **ADR-012 CSS mockup tanpa transformasi (baru):** Vite memakai transformer PostCSS dan `cssMinify:false`. Lightningcss mengubah `light-dark()` mockup dan menghilangkan border/tema (terbukti saat uji paritas). CSS di dalam `<template>` mockup dipisah karena di mockup hanya berlaku di shadow DOM komponen Monitoring.
- **ADR-013 Server dev tanpa Postgres (baru):** `npm run dev:mem` = API + web build + pg-mem + fixture sintetis. Hanya dev; ditolak di production.
- **ADR-014 Monitoring di shadow DOM (baru):** halaman Monitoring dirender lewat `createPortal` ke shadow root elemen `<production-monitoring>`, dengan CSS `<template>` mockup di dalamnya — isolasi CSS identik mockup. React mendengarkan event pada container portal sehingga `change`/`input` (tidak composed) tetap bekerja.
- **ADR-015 Jam server (baru):** `/auth/me` mengembalikan `today`/`now` (WIB) dan semua halaman memakai tanggal server, bukan jam perangkat (iPad kiosk bisa melenceng).
- **ADR-016 Settings generik (baru):** daftar Mesin/Produk/Penyebab/Defect/Peringatan disimpan sebagai `config.<section>` = `{rows:[...]}` (divalidasi zod, maks 2000 baris). Data yang punya tabel sendiri (line, target, akun, role, perangkat, kalender) memakai API masing-masing — satu sumber kebenaran.
