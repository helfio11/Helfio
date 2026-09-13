CREATE INDEX IF NOT EXISTS jobs_status_updated_idx ON jobs(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS provider_profiles_visibility_updated_idx ON provider_profiles(visibility, updated_at DESC);
CREATE INDEX IF NOT EXISTS reviews_provider_visible_created_idx ON reviews(provider_user_id, created_at DESC) WHERE moderation_status = 'VISIBLE';
CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit_log(created_at DESC);