# Model data DB dashboard

Migrasi: `apps/api/migrations/1732400000000_init.sql` (node-pg-migrate, SQL). 23 tabel: `locations, roles, role_permissions, role_menus, users, user_site_scope, sessions, devices, device_pairing_codes, audit_log, export_templates, settings, lines, machines, products, targets, calendar_exceptions, shifts, loss_causes, defects, alerts, push_snapshots, push_status`.

- Tabel yang bisa diedit punya `version` + `updated_at`.
- Seed: 3 lokasi (internal aktif; sgp/systech on_hold), 3 role bawaan + permission, 5 definisi shift.
- Token sesi/perangkat/kode pairing disimpan sebagai hash SHA-256.
- Settings yang dipakai logika (disimpan di tabel `settings`, tanpa migrasi baru):
  - `line_status` = `{ requiredFields: RunningField[], staleEnabled, staleThresholdMin (15–1440), staleInSummary }`
  - `line_discovery` = `{ shift_scheme: 2|3, location }`
  - Belum disimpan → default (7 field wajib, stale aktif 120 menit, juga di ringkasan; line baru 2 shift internal).

Status uji: migrasi dijalankan di **pg-mem**. **Belum di Postgres asli** (BLK-001). Backup/restore belum dibuat.
