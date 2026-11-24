-- Up Migration
-- Sesi 3: atribut line dari Settings mockup (produk, kode ConMas, cycle time) + target bulanan per line.

ALTER TABLE lines ADD COLUMN product text NOT NULL DEFAULT '';
ALTER TABLE lines ADD COLUMN external_code text NOT NULL DEFAULT '';
ALTER TABLE lines ADD COLUMN cycle_time numeric CHECK (cycle_time IS NULL OR cycle_time > 0);

CREATE TABLE line_targets (
  line_code   text NOT NULL REFERENCES lines(line_code),
  year        integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month       integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  target      numeric NOT NULL CHECK (target >= 0),
  work_days   integer NOT NULL CHECK (work_days BETWEEN 1 AND 31),
  note        text NOT NULL DEFAULT '',
  version     integer NOT NULL DEFAULT 1,
  updated_by  integer REFERENCES users(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (line_code, year, month)
);

-- iPad kiosk terikat ke satu line (Device Management mockup: "Lokasi / Line").
ALTER TABLE device_pairing_codes ADD COLUMN line_code text;
ALTER TABLE device_pairing_codes ADD COLUMN device_name text;
ALTER TABLE devices ADD COLUMN line_code text;

-- Down Migration
ALTER TABLE devices DROP COLUMN IF EXISTS line_code;
ALTER TABLE device_pairing_codes DROP COLUMN IF EXISTS line_code;
ALTER TABLE device_pairing_codes DROP COLUMN IF EXISTS device_name;
DROP TABLE IF EXISTS line_targets;
ALTER TABLE lines DROP COLUMN IF EXISTS cycle_time;
ALTER TABLE lines DROP COLUMN IF EXISTS external_code;
ALTER TABLE lines DROP COLUMN IF EXISTS product;
