CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 4000),
  city TEXT NOT NULL CHECK (char_length(city) BETWEEN 1 AND 120),
  postal_code TEXT CHECK (postal_code IS NULL OR char_length(postal_code) BETWEEN 1 AND 20),
  country_code TEXT NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  budget_type TEXT NOT NULL CHECK (budget_type IN ('FIXED', 'RANGE', 'NEGOTIABLE')),
  budget_min NUMERIC(12, 2) CHECK (budget_min IS NULL OR budget_min >= 0),
  budget_max NUMERIC(12, 2) CHECK (budget_max IS NULL OR budget_max >= 0),
  currency TEXT NOT NULL CHECK (currency IN ('EUR', 'USD', 'GBP', 'CHF')),
  preferred_date DATE,
  preferred_time_text TEXT CHECK (preferred_time_text IS NULL OR char_length(preferred_time_text) <= 120),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (budget_min IS NULL OR budget_max IS NULL OR budget_min <= budget_max)
);

CREATE INDEX IF NOT EXISTS jobs_customer_status_idx ON jobs(customer_user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS jobs_category_status_idx ON jobs(category_id, status);