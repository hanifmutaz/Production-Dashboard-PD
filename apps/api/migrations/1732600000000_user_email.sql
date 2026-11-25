-- Up Migration
ALTER TABLE users ADD COLUMN email text;
ALTER TABLE users ADD CONSTRAINT users_email_normalized CHECK (email = lower(trim(email)) AND length(email) BETWEEN 3 AND 254);
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);

-- Down Migration
ALTER TABLE users DROP COLUMN email;
