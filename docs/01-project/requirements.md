# G1 — Requirements & Traceability

Sumber: `COPILOT_PROMPT_V3.md`, `LOGIC_SPEC_Dashboard_Lama.md`, mockup, keputusan di `OPEN_QUESTIONS.md`.

## Scope
- Dalam scope: Hirose Internal; tampilan 1:1 mockup; logika = LOGIC_SPEC + keputusan OQ; login/RBAC/custom role/device pairing/export/audit/settings.
- Di luar scope tahap ini: data SGP/Systech (On Hold, integrasi PUSH nanti), deploy.

## Functional
| ID | Kebutuhan | Acceptance criteria | Tes |
|---|---|---|---|
| FR-001 | Detail line live & historis | Shift aktif dari teks shift baris; historis hanya tanggal persis; shift tidak ada → `data:null`+`shift_not_found` | `reporting.test.ts`, `shift.test.ts` |
| FR-002 | Status line | Running hanya bila field wajib (Settings) terisi; waiting/not_running sesuai masa tunggu; cek stale bisa diatur; detail & ringkasan pakai fungsi yang sama | `shift.test.ts`, `decisions.test.ts` |
| FR-003 | Tabel per jam hanya jam milik shift, lookup by index | Slot 06-07 shift malam = index 24 | `shift.test.ts`, `reporting.test.ts` |
| FR-004 | Summary shift berjalan, harian, bulanan | SUM numeric-safe; OEE berbobot jam_target; PPM dari SUM; anomali dihitung | `reporting.test.ts`, `decisions.test.ts` |
| FR-005 | Range trend `hasData` | Hari tanpa data ≠ 0 | `reporting.test.ts` |
| FR-006 | Breakdown per line | deviasi = plan − actual; PPM per line; produk dari baris terbaru | `reporting.test.ts` |
| FR-007 | Reject & stoptime detail dari 150 slot | Slot kosong difilter, urut terbesar | `reporting.test.ts` |
| FR-008 | Executive target/kalender/pencapaian/trend | Rumus §5 + split s/d kemarin & hari ini; SGP/Systech On Hold | `formulas.test.ts`, `security.test.ts`, `decisions.test.ts` |
| FR-009 | Line registry + discovery | Default line baru dari Settings; nonaktifkan, bukan hapus | `decisions.test.ts` |
| FR-010 | Penerima push-sync (nonaktif default) | 503 saat off; key salah 401; snapshot tua ditolak | `security.test.ts` |
| FR-011 | Login, sesi, lockout | Pesan seragam; kunci setelah N gagal | `security.test.ts` |
| FR-012 | Role bawaan + Custom Role + scope lokasi | 401/403 per endpoint × role | `security.test.ts` |
| FR-013 | Device pairing & kiosk read-only | Kode sekali pakai, kedaluwarsa, cabut | `security.test.ts` |
| FR-014 | Export server-side + template | Izin `export.run`; audit | `security.test.ts` (csv/json) |
| FR-015 | Settings | Versioned + audit; `line_status` & `line_discovery` divalidasi ketat | `security.test.ts`, `decisions.test.ts` |
| FR-016 | Frontend 1:1 mockup | Screenshot nyaris identik | **BELUM** |

## Non-functional
| ID | Kebutuhan | Bukti |
|---|---|---|
| NFR-001 | TypeScript strict, tanpa `any` | `npm run typecheck`, ESLint |
| NFR-002 | Env divalidasi saat start | `env.test.ts` |
| NFR-003 | Model error seragam | `reporting.test.ts` |
| NFR-004 | Log meredaksi rahasia | `app.ts` (review kode) |
| NFR-005 | Query bulanan cukup cepat | **Belum diukur** (butuh Postgres asli) |

## Business invariants
| ID | Invariant | Tes |
|---|---|---|
| INV-001 | ConMas tidak pernah ditulis | `conmas.test.ts`, `reporting.test.ts` |
| INV-002 | Rumus sesuai LOGIC_SPEC + keputusan OQ; hari tanpa data ≠ 0 | `formulas.test.ts`, `reporting.test.ts` |
| INV-003 | Tanggal tidak geser hari | `shift.test.ts`, `formulas.test.ts` |
| INV-004 | Endpoint tulis/ekspor hanya role berhak | `security.test.ts` |
| INV-005 | Kode pairing sekali pakai & kedaluwarsa | `security.test.ts` |
| INV-006 | Tidak saling menimpa (409) | `security.test.ts` |
| INV-007 | Snapshot tua tidak menimpa | `security.test.ts` |
| INV-008 | Aksi sensitif tercatat | `security.test.ts` |
