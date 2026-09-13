CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  customer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT CHECK (comment IS NULL OR char_length(comment) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (customer_user_id <> provider_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS reviews_job_provider_idx ON reviews(job_id, provider_user_id);
CREATE INDEX IF NOT EXISTS reviews_provider_created_idx ON reviews(provider_user_id, created_at DESC);