-- Up Migration
-- Self-register + approval admin. Akun yang sudah ada otomatis berstatus 'approved' (default).
-- Pendaftar baru berstatus 'pending' dan tetap active = false sampai admin menyetujui.
ALTER TABLE users ADD COLUMN status text NOT NULL DEFAULT 'approved';
ALTER TABLE users ADD COLUMN department text;
ALTER TABLE users ADD COLUMN purpose text;
ALTER TABLE users ADD COLUMN reviewed_by integer;
ALTER TABLE users ADD COLUMN reviewed_at timestamptz;
ALTER TABLE users ADD COLUMN review_note text;
ALTER TABLE users ADD CONSTRAINT users_status_valid CHECK (status IN ('pending', 'approved', 'rejected'));
-- Invarian: akun yang belum/tidak disetujui tidak boleh aktif.
ALTER TABLE users ADD CONSTRAINT users_unapproved_inactive CHECK (status = 'approved' OR active = false);
ALTER TABLE users ADD CONSTRAINT users_reviewed_by_fk FOREIGN KEY (reviewed_by) REFERENCES users(id);
CREATE INDEX users_status_idx ON users(status);

-- Down Migration
DROP INDEX IF EXISTS users_status_idx;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_reviewed_by_fk;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_unapproved_inactive;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_valid;
ALTER TABLE users DROP COLUMN review_note, DROP COLUMN reviewed_at, DROP COLUMN reviewed_by, DROP COLUMN purpose, DROP COLUMN department, DROP COLUMN status;
