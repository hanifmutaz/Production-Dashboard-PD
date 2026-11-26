import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { isUniqueViolation } from '../../db/optimistic.js';
import { withTransaction, type DbPool } from '../../db/pool.js';
import { AppError } from '../../http/errors.js';
import { recordAudit } from '../audit/auditService.js';
import { AuthService } from './authService.js';

/** Batas antrean pending agar form publik tidak bisa membanjiri halaman admin. */
export const MAX_PENDING_REGISTRATIONS = 200;

/**
 * Body pendaftaran publik. Sengaja TIDAK ada role/lokasi/status: itu hanya ditentukan admin saat approval.
 * Field di luar skema dibuang oleh zod (object non-strict), jadi `role: 'admin'` dari klien tidak berefek.
 */
export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
  display_name: z.string().trim().min(2, 'nama minimal 2 karakter').max(80),
  department: z.string().trim().min(2, 'departemen/bagian wajib diisi').max(80),
  purpose: z.string().trim().min(10, 'kebutuhan minimal 10 karakter').max(500),
  password: z.string().min(10, 'password minimal 10 karakter').max(200),
  /** Honeypot: field tersembunyi di form. Manusia tidak mengisinya; bot biasanya mengisi semua field. */
  website: z.string().max(200).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const REGISTER_ACCEPTED_MESSAGE = 'Pendaftaran diterima. Akun Anda aktif setelah disetujui admin.';

/**
 * Daftar akun mandiri. Akun dibuat dengan status 'pending' dan active = false (dijaga CHECK di DB),
 * role sementara 'viewer' tanpa efek karena akun belum bisa login. Email yang pernah ditolak boleh mendaftar ulang.
 */
export async function registerUser(pool: DbPool, input: RegisterInput, req: { requestId: string }): Promise<void> {
  if (input.website) return; // bot: pura-pura sukses, tanpa menyimpan apa pun.

  const pending = await pool.query(`SELECT count(*) AS n FROM users WHERE status = 'pending'`);
  if (Number(pending.rows[0]?.['n'] ?? 0) >= MAX_PENDING_REGISTRATIONS)
    throw new AppError(429, 'REGISTRATION_QUEUE_FULL', 'Antrean pendaftaran sedang penuh. Hubungi admin.');

  const hash = await AuthService.hashPassword(input.password);
  await withTransaction(pool, async (tx) => {
    const again = await tx.query(
      `UPDATE users SET display_name = $2, department = $3, purpose = $4, password_hash = $5, status = 'pending', active = false,
         failed_attempts = 0, locked_until = NULL, reviewed_by = NULL, reviewed_at = NULL, review_note = NULL,
         created_at = now(), version = version + 1, updated_at = now()
       WHERE email = $1 AND status = 'rejected' RETURNING id`,
      [input.email, input.display_name, input.department, input.purpose, hash],
    );
    if (again.rows[0]) {
      await recordAudit(tx, req, { action: 'user.register_again', target: input.email });
      return;
    }
    const role = (await tx.query(`SELECT id FROM roles WHERE code = 'viewer'`)).rows[0];
    if (!role) throw new AppError(500, 'INTERNAL', 'Role dasar tidak ditemukan');
    await tx.query(
      `INSERT INTO users (email, display_name, department, purpose, password_hash, role_id, username, status, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', false)`,
      [input.email, input.display_name, input.department, input.purpose, hash, role['id'], randomUUID()],
    );
    await recordAudit(tx, req, { action: 'user.register', target: input.email, detail: { department: input.department } });
  }).catch((err: unknown) => {
    throw isUniqueViolation(err) ? new AppError(409, 'EMAIL_TAKEN', 'Email sudah terdaftar atau masih menunggu persetujuan.') : err;
  });
}
