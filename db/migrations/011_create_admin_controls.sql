ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'VISIBLE'
    CHECK (moderation_status IN ('VISIBLE', 'HIDDEN'));

CREATE INDEX IF NOT EXISTS reviews_moderation_status_idx ON reviews(moderation_status);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (char_length(action) BETWEEN 1 AND 120),
  target_type TEXT NOT NULL CHECK (char_length(target_type) BETWEEN 1 AND 80),
  target_id TEXT NOT NULL CHECK (char_length(target_id) BETWEEN 1 AND 120),
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log(created_at DESC);
CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z0-9_]{1,80}$'),
  value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
