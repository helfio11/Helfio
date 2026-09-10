CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  show_in_navigation BOOLEAN NOT NULL DEFAULT false,
  show_on_homepage BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE category_translations (
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'de', 'sq', 'tr')),
  name TEXT NOT NULL,
  description TEXT,
  PRIMARY KEY (category_id, locale)
);

CREATE INDEX categories_parent_id_idx ON categories(parent_id);
CREATE INDEX categories_navigation_idx ON categories(show_in_navigation) WHERE status = 'active';
CREATE INDEX categories_homepage_idx ON categories(show_on_homepage) WHERE status = 'active';