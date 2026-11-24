# PROGRESS — baca ini dulu bila melanjutkan

Branch `feature/v3`. Diperbarui 2026-11-25 (sesi 2).

## Sesi 2 (2026-11-25)
- [x] Rebuild repo dari riwayat (sandbox ter-reset) → `npm run verify` EXIT 0, **102/102 tes identik sesi 1** (commit `chore: rebuild …`)
- [x] Terapkan 18 keputusan OPEN_QUESTIONS + tes per keputusan (lihat `OPEN_QUESTIONS.md`)
- [x] Settings logika: `line_status` (syarat Running, cek stale), `line_discovery` (default line baru), `GET /settings/effective`
- [x] Tes yang dulu belum ada: discovery/sync line

## Tahap A–D — selesai (detail lihat sesi 1 di FINAL_REPORT)
- [~] `MOCKUP_INVENTORY.md` masih parsial
- [ ] `docs/api-samples/`
- [ ] Skrip impor `lines.json` / `executiveTargets.json` / `executiveCalendar.json` (file belum ada)
- [ ] Tes: list/PATCH user, ekspor xlsx/tsv, template ekspor

## Tahap E — Frontend — **BELUM DIMULAI**
Butuh upload ulang mockup HTML. Urutan: inventaris halaman → ekstrak CSS/font/ikon → shell (sidebar/rail/router) → Executive → Master Hub → Master lokasi → Monitoring Output → Pilih Line/Detail → Stoptime → Reject/OEE/Detail Produksi → Export → Settings → Login/akses/device/kiosk.
Keputusan UI yang perlu persetujuan user: lokasi form `line_status` di Settings; tampilan split Executive (OQ-014) bila layout tidak muat.

## Tahap F
- [x] Tes invariant, RBAC, pairing, 409, snapshot
- [ ] Playwright · [ ] EXPLAIN ANALYZE di Postgres asli · [ ] npm audit · [ ] `compareWithIReporter` · [ ] dokumen deploy/rollback/backup
