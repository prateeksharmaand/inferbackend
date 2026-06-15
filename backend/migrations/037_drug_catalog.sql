-- Indian Drug Catalog
-- Stores 50k–200k Indian brand + generic + homeopathic medicines
-- Supports fast full-text + prefix search via GIN index on tsvector

CREATE TABLE IF NOT EXISTS drug_catalog (
  id               SERIAL PRIMARY KEY,
  brand_name       VARCHAR(255) NOT NULL,
  generic_name     TEXT,
  manufacturer     VARCHAR(255),
  strength         VARCHAR(128),
  dosage_form      VARCHAR(64),        -- Tablet, Syrup, Injection, Drops, Cream…
  category         VARCHAR(32)  DEFAULT 'allopathy',  -- allopathy | homeopathy | ayurvedic | unani
  schedule         VARCHAR(16),        -- H, H1, X, OTC, etc.
  atc_code         VARCHAR(16),        -- WHO ATC code if available
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  search_vector    TSVECTOR,           -- GIN-indexed, auto-maintained by trigger
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_drug_catalog_fts
  ON drug_catalog USING GIN(search_vector);

-- Trigram index for prefix / LIKE search (handles partial brand names)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_drug_catalog_brand_trgm
  ON drug_catalog USING GIN(brand_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_drug_catalog_generic_trgm
  ON drug_catalog USING GIN(generic_name gin_trgm_ops);

-- Category index (filter by allopathy / homeopathy)
CREATE INDEX IF NOT EXISTS idx_drug_catalog_category
  ON drug_catalog(category);

-- Trigger: keep search_vector in sync on insert/update
CREATE OR REPLACE FUNCTION drug_catalog_search_vector_update() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.brand_name, '')),   'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.generic_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.manufacturer, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS drug_catalog_tsvector_update ON drug_catalog;
CREATE TRIGGER drug_catalog_tsvector_update
  BEFORE INSERT OR UPDATE ON drug_catalog
  FOR EACH ROW EXECUTE FUNCTION drug_catalog_search_vector_update();
