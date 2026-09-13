ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS assigned_provider_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS jobs_assigned_provider_status_idx ON jobs(assigned_provider_user_id, status, updated_at DESC);