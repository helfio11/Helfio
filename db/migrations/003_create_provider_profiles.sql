CREATE TABLE IF NOT EXISTS provider_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 160),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  profile_image_ref TEXT CHECK (profile_image_ref IS NULL OR char_length(profile_image_ref) <= 500),
  phone TEXT CHECK (phone IS NULL OR char_length(phone) <= 40),
  contact_email TEXT CHECK (contact_email IS NULL OR char_length(contact_email) <= 320),
  city TEXT NOT NULL CHECK (char_length(city) BETWEEN 1 AND 120),
  postal_code TEXT NOT NULL CHECK (char_length(postal_code) BETWEEN 1 AND 20),
  service_radius_km NUMERIC(6, 2) NOT NULL DEFAULT 10 CHECK (service_radius_km >= 0 AND service_radius_km <= 1000),
  availability_status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (availability_status IN ('AVAILABLE', 'BUSY', 'UNAVAILABLE')),
  years_experience INTEGER NOT NULL DEFAULT 0 CHECK (years_experience BETWEEN 0 AND 100),
  starting_price NUMERIC(10, 2) CHECK (starting_price IS NULL OR starting_price >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PUBLIC', 'PRIVATE')),
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('UNVERIFIED', 'PENDING', 'VERIFIED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_services (
  provider_user_id UUID NOT NULL REFERENCES provider_profiles(user_id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_user_id, category_id)
);

CREATE INDEX IF NOT EXISTS provider_profiles_public_idx ON provider_profiles(visibility, updated_at DESC);
CREATE INDEX IF NOT EXISTS provider_services_category_idx ON provider_services(category_id);