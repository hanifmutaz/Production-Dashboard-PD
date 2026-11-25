-- Up Migration
ALTER TABLE devices ADD COLUMN screen text NOT NULL DEFAULT 'line' CHECK (screen IN ('line','hub','executive'));
ALTER TABLE device_pairing_codes ADD COLUMN screen text NOT NULL DEFAULT 'line' CHECK (screen IN ('line','hub','executive'));

-- Down Migration
ALTER TABLE device_pairing_codes DROP COLUMN screen;
ALTER TABLE devices DROP COLUMN screen;
