# OPEN QUESTIONS — keputusan (2026-11-25, dijawab Hanif Mutaz)

Status: **semua item diputuskan** (OQ-007b ditutup 2026-11-25: satuan menit). Bukti data dari query user ke `public.view_report_25415` (4.050 report).

| ID | Keputusan | Bukti / alasan | Implementasi | Tes |
|---|---|---|---|---|
| OQ-001 | Stoptime dalam **menit** | Jawaban user | `formulas.ts#stoptimeTotal`, kontrak & meta `units.stoptime='menit'` | `formulas.test.ts` |
| OQ-002 | Total reject = **M107 saja**. F027/F028 bukan reject in-process | Jawaban user | `reject_qty` = kolom 2917; P027/P028 tidak dikirim lagi | `reporting.test.ts` |
| OQ-003 | PPM gabungan = **Σreject / (Σoutput + Σreject) × 1e6** | Rumus ini cocok **20/20** dengan `qty_reject_ppm` ConMas (mis. 5/(500+5)=9.901). Total dihitung dari SUM, bukan rata-rata PPM (rata-rata bias ke report qty kecil) | `formulas.ts#rejectPpm`; `reject_ppm` di summary & breakdown | `formulas.test.ts` (20 baris asli), `reporting.test.ts` |
| OQ-004 | OEE gabungan **berbobot `jam_target`**: Σ(OEE×jam_target)/Σjam_target | Rekomendasi diterima. Report singkat tidak boleh setara report 8 jam. **Angka akan beda dari dashboard lama** | `formulas.ts#weightedOee`, SQL `oee_weighted/oee_weight` | `formulas.test.ts`, `decisions.test.ts` |
| OQ-005 | Skala **0–100**. Nilai di luar 0–100 = anomali: dikeluarkan dari OEE gabungan, dihitung `oee_anomaly_count`, ditandai `anomaly:true` di `/reports`. **Tidak di-clamp** | Data asli: OEE = A×P×Q/10.000; ditemukan OEE −101, −133, −93 (Availability minus) | `isValidPercent`, `isPercentAnomaly` | `formulas.test.ts`, `decisions.test.ts` |
| OQ-006 | Deviasi = **Plan − Actual di semua halaman** (detail line, per jam, breakdown). Positif = kurang dari target. Label UI wajib: "Kurang (Plan − Actual)" | Jawaban user | `formulas.ts#deviasi(plan, actual)` (fungsi `breakdownDeviasi` dihapus) | `formulas.test.ts`, `reporting.test.ts` |
| OQ-007 | Sogo/Shugyo/Kikai gabungan = **SUM kolom TOTAL** (2924–2926) | Data asli: TOTAL = Σ CL 1–6 (mis. 15+40=55) | SQL + summary `sogo/shugyo/kikai` | `decisions.test.ts` |
| OQ-007b | Satuan Sogo/Shugyo/Kikai = **menit** | Jawaban user 2026-11-25 | `meta.units` di `/reports`, kontrak `SummaryTotals` | `decisions.test.ts` |
| OQ-008 | Tidak ada double counting & tidak perlu filter `deleted` | `rep_top_id` dobel = 0 baris; `deleted` = 0 untuk 4.050/4.050 report | Tidak ada perubahan kode | — |
| OQ-009 | Masalah 70/86 akan muncul di view yang sama setelah setting ConMas | Jawaban user | Guard kolom runtime tetap (NULL bila belum ada) | `reporting.test.ts` |
| OQ-010 | HOLD — kolom `2928_d`/`2929_d` belum dipakai | Jawaban user | Tidak dipakai | — |
| OQ-011 | **Running** = CL No, Line Leader, Cell Leader, Teknisi, Inspector, Output Plan, Output Actual terisi. Daftar field **diatur di Settings** (`line_status.requiredFields`). Angka 0 = terisi | Jawaban user. Report belum lengkap: ≤ masa tunggu → Waiting, lewat → Not Running. Historis: lengkap → running, tidak → not_running | `runningRules.ts`, `getLineStatus3`, `SettingsService`; `missing_fields` di detail line | `runningRules.test.ts`, `shift.test.ts`, `decisions.test.ts` |
| OQ-012 | Cek stale **diatur di Settings**: `staleEnabled`, `staleThresholdMin` (15–1440), `staleInSummary`. Default: aktif di detail **dan** ringkasan (satu fungsi status) | Jawaban user | `ReportingService#liveStatus` | `decisions.test.ts` |
| OQ-013 | Ditutup — tidak ada teks shift rusak | 5 nilai, semua berformat `Shift N (N Shift)` | — | — |
| OQ-014 | Executive: tambah **s/d kemarin** (target & actual hari lengkap, apple-to-apple) + **progres hari ini** terpisah. Field lama (`targetHariIni` inklusif) tetap ada | Rekomendasi. Bila layout mockup tidak muat tanpa ubah desain → frontend pakai field lama dan tanya user dulu | `executive.ts#splitAchievement`, `LocationAchievement.split`, `totalSplit` | `formulas.test.ts`, `decisions.test.ts` |
| OQ-015 | Total Executive = lokasi yang tersedia saja (subcont belum tersambung) | Jawaban user | Tidak berubah | `security.test.ts` |
| OQ-016 | `cluster_1_17_t` = Line No | Jawaban user | Tidak berubah | — |
| OQ-017 | Default skema shift & lokasi line baru **diatur di Settings** (`line_discovery`) | Jawaban user | `POST /lines/sync` | `decisions.test.ts` |
| OQ-018 | Integrasi subcont = **PUSH** subcont → internal (bukan pull) | Jawaban user | Penerima `/api/sync` sudah ada, mati sampai Fase Subcont | `security.test.ts` |

Catatan konsistensi: "Gap" di Executive tetap **actual − target** (LOGIC_SPEC §5) karena OQ-006 hanya membahas deviasi output. Kalau mau diseragamkan juga, putuskan terpisah.
