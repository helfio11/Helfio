ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS users_anonymized_idx ON users(anonymized_at) WHERE anonymized_at IS NOT NULL;
