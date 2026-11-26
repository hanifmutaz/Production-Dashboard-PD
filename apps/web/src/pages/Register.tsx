import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';

const MIN_PASSWORD = 10;

/** Form daftar akun mandiri. Akun baru berstatus pending sampai admin menyetujui (role & lokasi ditentukan admin). */
export function RegisterForm({ onBack }: { readonly onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const submit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const text = (k: string): string => String(f.get(k) ?? '');
    const password = text('password');
    if (password.length < MIN_PASSWORD) return setError(`Password minimal ${MIN_PASSWORD} karakter.`);
    if (password !== text('confirm')) return setError('Konfirmasi password tidak sama.');
    setBusy(true);
    setError('');
    try {
      const res = await api.post<{ message: string }>('/api/v3/auth/register', {
        email: text('email'),
        display_name: text('name'),
        department: text('department'),
        purpose: text('purpose'),
        password,
        website: text('website'),
      });
      setDone(res.data?.message ?? 'Pendaftaran diterima. Akun Anda aktif setelah disetujui admin.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Pendaftaran gagal. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <div className="login-form" id="register-done">
        <p className="settings-feedback" role="status">
          {done}
        </p>
        <p className="sb">Anda bisa masuk setelah admin menyetujui pendaftaran. Hubungi admin bila perlu dipercepat.</p>
        <button type="button" className="btn pri login-submit" onClick={onBack}>
          Kembali ke halaman masuk
        </button>
      </div>
    );

  return (
    <form id="register-form" className="login-form" onSubmit={(e) => void submit(e)}>
      <label className="fld">
        Email
        <input name="email" type="email" required autoComplete="email" autoCapitalize="none" maxLength={254} />
      </label>
      <label className="fld">
        Nama lengkap
        <input name="name" type="text" required minLength={2} maxLength={80} autoComplete="name" />
      </label>
      <label className="fld">
        Departemen / bagian
        <input name="department" type="text" required minLength={2} maxLength={80} placeholder="mis. Production, QA, Maintenance" />
      </label>
      <label className="fld">
        Kebutuhan akses
        <textarea name="purpose" required minLength={10} maxLength={500} rows={3} placeholder="Untuk apa Anda butuh akses dashboard ini?" />
      </label>
      <label className="fld">
        Password
        <input name="password" type="password" required minLength={MIN_PASSWORD} maxLength={200} autoComplete="new-password" />
        <span className="sb">Minimal {MIN_PASSWORD} karakter.</span>
      </label>
      <label className="fld">
        Ulangi password
        <input name="confirm" type="password" required maxLength={200} autoComplete="new-password" />
      </label>
      {/* Honeypot anti-bot: tersembunyi dari pengguna & pembaca layar; manusia tidak mengisinya. */}
      <div className="hp-field" aria-hidden="true">
        <label>
          Website
          <input name="website" type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <button type="submit" className="btn pri login-submit" disabled={busy} aria-busy={busy}>
        {busy ? 'Mengirim…' : 'Kirim pendaftaran'}
      </button>
      <p className="sb" role="alert">
        {error}
      </p>
      <p className="login-switch">
        Sudah punya akun?
        <button type="button" onClick={onBack}>
          Masuk
        </button>
      </p>
    </form>
  );
}
