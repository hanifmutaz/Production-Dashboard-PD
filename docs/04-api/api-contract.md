# Kontrak API v3

Sukses: `{ data, status, meta? }`. "Tidak ada data" = **200** + `data: null` + `status` (`no_data`, `shift_not_found`, `on_hold`, `waiting`, `not_running`). Error: `{ error: { code, message, requestId } }`. Request tulis berbasis cookie wajib header `x-v3-csrf: 1`.

**Konvensi angka (keputusan OQ):** stoptime = menit; deviasi = Plan − Actual (positif = kurang); reject = M107 saja; `reject_ppm` = Σreject/(Σoutput+Σreject)×1e6; `oee` gabungan = berbobot jam_target tanpa anomali, `oee_anomaly_count` = jumlah report OEE di luar 0–100.

| Method & path | Izin | Keterangan |
|---|---|---|
| `POST /api/v3/auth/login` · `POST /logout` · `GET /me` | publik / login | cookie `v3_session` |
| `POST /api/v3/auth/pair` | publik (rate limit) | `{code,name}` → `{device, token}` |
| `GET /api/v3/reporting/line-detail?line=&date?&shift?` | dashboard.view | `LineDetail` + `missing_fields` |
| `GET /api/v3/reporting/summary/current?location?` | dashboard.view | + `lines[].status`, `lines[].missing_fields` |
| `GET /api/v3/reporting/summary/daily?date=` · `/summary/monthly?year=&month=` | dashboard.view | `SummaryTotals` |
| `GET /api/v3/reporting/trend/range?start=&end=&line?` | dashboard.view | `days[].hasData` |
| `GET /api/v3/reporting/breakdown?start=&end=` | dashboard.view | + `reject_ppm` per line |
| `GET /api/v3/reporting/reject` · `/stoptime` | dashboard.view | |
| `GET /api/v3/reporting/reports?start=&end=` | dashboard.investigate | + `anomaly`, `sogo/shugyo/kikai`, `reject_ppm` |
| `GET /api/v3/executive/month?year=&month=` | dashboard.view | `locations[].achievement` (lama) + `locations[].split` + `totalSplit` |
| `GET /api/v3/executive/trend` · `PUT /target` · `GET/PUT /calendar` | view / config.edit | |
| `GET /api/v3/lines` · `PUT/DELETE /lines/:code` · `GET /lines/discover` · `POST /lines/sync` | view / config.edit | sync memakai `line_discovery` |
| `GET /api/v3/settings` · `GET /settings/effective` · `PUT /settings/:key` | view / config.edit | `line_status` & `line_discovery` divalidasi ketat |
| `/api/v3/access/*` (roles, users, devices, audit) | users/devices.manage, audit.view | |
| `POST /api/v3/export` · `/export/templates` | export.run | |
| `POST /api/sync` · `GET /api/sync/status` | x-sync-key / view | PUSH subcont; 503 saat off |
| `GET /healthz` · `GET /readyz` | publik | |
