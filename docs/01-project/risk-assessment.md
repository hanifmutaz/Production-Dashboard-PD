# G0 — Risk Assessment

**Sistem:** Dashboard Production V3 (Hirose Electric Indonesia — Internal). **Owner proses:** perlu ditetapkan (Production/PM). **Owner teknis:** Hanif Mutaz.

| Dimensi | Penilaian | Alasan | Kontrol |
|---|---|---|---|
| Dampak angka salah | **Tinggi** | Angka output/OEE/reject dipakai keputusan produksi | Rumus tunggal di `packages/shared` + unit test; keputusan rumus tercatat di OPEN_QUESTIONS; PPM diuji dengan 20 baris DB asli |
| Integritas data sumber | Tinggi | DB ConMas milik vendor | Read-only berlapis (akun RO, `default_transaction_read_only`, guard SELECT-only) — INV-001 |
| Keamanan/akses | Sedang | Login + RBAC + kiosk, jaringan internal | argon2, sesi httpOnly SameSite=Strict, CSRF header, rate limit, lockout, audit |
| Ketersediaan | Sedang | Downtime mengganggu pemantauan, tidak menghentikan produksi | `/healthz`, `/readyz`, fail-fast env |
| Konkurensi | Sedang | Banyak admin bisa edit target/kalender/settings | Optimistic locking `version` → 409 (INV-006) |
| Data pribadi | Rendah | Nama CL/teknisi/inspector dari form | Log meredaksi cookie/token |

**Level: MEDIUM**, dimensi "angka salah" diperlakukan HIGH (setiap rumus wajib tes unit).

Risiko baru dari keputusan 2026-11-25: OEE berbobot (OQ-004) dan PPM dari SUM (OQ-003) membuat angka **berbeda dari dashboard lama**. Ini disengaja; perlu dikomunikasikan ke pengguna saat go-live.
