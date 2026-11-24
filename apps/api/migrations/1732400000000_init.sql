-- Up Migration
-- Skema DB dashboard V3. Terpisah dari DB ConMas (aturan keras #2). Semua tabel yang bisa diedit punya
-- kolom version (optimistic locking, INV-006) dan updated_at.

CREATE TABLE locations (
  code        text PRIMARY KEY CHECK (code IN ('internal', 'sgp', 'systech')),
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'on_hold' CHECK (status IN ('active', 'on_hold')),
  sort_order  integer NOT NULL DEFAULT 0,
  version     integer NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id          serial PRIMARY KEY,
  code        text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9_-]{2,40}$'),
  name        text NOT NULL,
  is_builtin  boolean NOT NULL DEFAULT false,
  version     integer NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
  role_id     integer NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission  text NOT NULL,
  PRIMARY KEY (role_id, permission)
);

CREATE TABLE role_menus (
  role_id     integer NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  menu        text NOT NULL,
  PRIMARY KEY (role_id, menu)
);

CREATE TABLE users (
  id               serial PRIMARY KEY,
  username         text NOT NULL UNIQUE CHECK (username ~ '^[A-Za-z0-9._-]{3,60}$'),
  display_name     text NOT NULL,
  password_hash    text NOT NULL,
  role_id          integer NOT NULL REFERENCES roles(id),
  active           boolean NOT NULL DEFAULT true,
  failed_attempts  integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until     timestamptz,
  version          integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_site_scope (
  user_id   integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location  text NOT NULL REFERENCES locations(code),
  PRIMARY KEY (user_id, location)
);

CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE devices (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  token_hash    text NOT NULL UNIQUE,
  location      text REFERENCES locations(code),
  created_by    integer REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz,
  revoked_at    timestamptz
);

CREATE TABLE device_pairing_codes (
  id           serial PRIMARY KEY,
  code_hash    text NOT NULL UNIQUE,
  location     text REFERENCES locations(code),
  created_by   integer NOT NULL REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  device_id    integer REFERENCES devices(id)
);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_type  text NOT NULL CHECK (actor_type IN ('user', 'device', 'system', 'anonymous')),
  actor_id    integer,
  action      text NOT NULL,
  target      text,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id  text
);
CREATE INDEX audit_log_at_idx ON audit_log(at DESC);

CREATE TABLE export_templates (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  owner_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  definition  jsonb NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);

CREATE TABLE settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  updated_by  integer REFERENCES users(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lines (
  line_code     text PRIMARY KEY CHECK (line_code ~ '^[A-Za-z0-9_-]+$'),
  description   text NOT NULL DEFAULT '',
  shift_scheme  smallint NOT NULL DEFAULT 2 CHECK (shift_scheme IN (2, 3)),
  location      text NOT NULL DEFAULT 'internal' REFERENCES locations(code),
  active        boolean NOT NULL DEFAULT true,
  version       integer NOT NULL DEFAULT 1,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE machines (
  id         serial PRIMARY KEY,
  line_code  text NOT NULL REFERENCES lines(line_code),
  code       text NOT NULL,
  name       text NOT NULL DEFAULT '',
  active     boolean NOT NULL DEFAULT true,
  version    integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (line_code, code)
);

CREATE TABLE products (
  id         serial PRIMARY KEY,
  cl_no      text NOT NULL UNIQUE,
  name       text NOT NULL DEFAULT '',
  active     boolean NOT NULL DEFAULT true,
  version    integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE targets (
  location    text NOT NULL REFERENCES locations(code),
  year        integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month       integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  target      numeric NOT NULL CHECK (target >= 0),
  version     integer NOT NULL DEFAULT 1,
  updated_by  integer REFERENCES users(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (location, year, month)
);

-- Satu baris per lokasi-bulan; tidak ada baris = default libur Sabtu & Minggu.
CREATE TABLE calendar_exceptions (
  location    text NOT NULL REFERENCES locations(code),
  year        integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month       integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  holidays    text[] NOT NULL DEFAULT '{}',
  version     integer NOT NULL DEFAULT 1,
  updated_by  integer REFERENCES users(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (location, year, month)
);

CREATE TABLE shifts (
  id          serial PRIMARY KEY,
  scheme      smallint NOT NULL CHECK (scheme IN (2, 3)),
  shift_num   smallint NOT NULL CHECK (shift_num BETWEEN 1 AND 3),
  label       text NOT NULL,
  UNIQUE (scheme, shift_num)
);

CREATE TABLE loss_causes (
  id         serial PRIMARY KEY,
  category   text NOT NULL CHECK (category IN ('Machine', 'Man', 'Material', 'Method', 'Other')),
  name       text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  version    integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, name)
);

CREATE TABLE defects (
  id         serial PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  active     boolean NOT NULL DEFAULT true,
  version    integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alerts (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  rule        jsonb NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  version     integer NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Snapshot terbaru per (source, type). Snapshot lebih tua ditolak (INV-007).
CREATE TABLE push_snapshots (
  source             text NOT NULL CHECK (source IN ('sgp', 'systech')),
  type               text NOT NULL,
  payload_timestamp  timestamptz NOT NULL,
  received_at        timestamptz NOT NULL DEFAULT now(),
  data               jsonb NOT NULL,
  PRIMARY KEY (source, type)
);

CREATE TABLE push_status (
  source          text PRIMARY KEY CHECK (source IN ('sgp', 'systech')),
  last_received   timestamptz,
  last_accepted   timestamptz,
  last_rejected   timestamptz,
  rejected_count  integer NOT NULL DEFAULT 0
);

INSERT INTO locations (code, name, status, sort_order) VALUES
  ('internal', 'Hirose Internal', 'active', 1),
  ('sgp', 'SGP', 'on_hold', 2),
  ('systech', 'Systech', 'on_hold', 3);

INSERT INTO roles (code, name, is_builtin) VALUES
  ('viewer', 'Viewer', true),
  ('supervisor', 'Supervisor', true),
  ('admin', 'Admin', true);

INSERT INTO role_permissions (role_id, permission)
SELECT r.id, p.permission FROM roles r
JOIN (VALUES
  ('viewer', 'dashboard.view'), ('viewer', 'meeting.use'),
  ('supervisor', 'dashboard.view'), ('supervisor', 'meeting.use'), ('supervisor', 'dashboard.investigate'),
  ('supervisor', 'export.run'),
  ('admin', 'dashboard.view'), ('admin', 'meeting.use'), ('admin', 'dashboard.investigate'), ('admin', 'export.run'),
  ('admin', 'config.edit'), ('admin', 'users.manage'), ('admin', 'devices.manage'), ('admin', 'audit.view')
) AS p(role_code, permission) ON p.role_code = r.code;

INSERT INTO shifts (scheme, shift_num, label) VALUES
  (2, 1, 'Shift 1 (2 Shift)'), (2, 2, 'Shift 2 (2 Shift)'),
  (3, 1, 'Shift 1 (3 Shift)'), (3, 2, 'Shift 2 (3 Shift)'), (3, 3, 'Shift 3 (3 Shift)');

-- Down Migration
DROP TABLE IF EXISTS push_status, push_snapshots, alerts, defects, loss_causes, shifts, calendar_exceptions,
  targets, products, machines, lines, settings, export_templates, audit_log, device_pairing_codes, devices,
  sessions, user_site_scope, users, role_menus, role_permissions, roles, locations CASCADE;
