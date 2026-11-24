# G2 — Arsitektur

Modular monolith, npm workspaces:

```
packages/shared   fungsi murni: shift, waktu WIB, rumus, syarat Running, kalender kerja, band, format, kontrak API
apps/api          Express: routes → service → repository
  modules/reporting    baca ConMas (read-only)
  modules/executive    target, kalender, pencapaian (+ split s/d kemarin / hari ini)
  modules/masterData   line registry (+discovery, default dari Settings)
  modules/settings     settings versioned + SettingsService (line_status, line_discovery)
  modules/auth         login, sesi, pairing
  modules/access       user, role, custom role, device, audit view
  modules/export       ekspor server-side + template
  modules/audit        audit log
  modules/sync         penerima PUSH subcont (off default)
apps/web          (BELUM DIBANGUN — Tahap E)
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
