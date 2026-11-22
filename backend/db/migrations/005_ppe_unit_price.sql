-- 005 - Unit price of work clothing / equipment items (entered by HR; no prices are built in). Additive only.
ALTER TABLE ppe_items ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ppe_items_price_chk') THEN ALTER TABLE ppe_items ADD CONSTRAINT ppe_items_price_chk CHECK (unit_price IS NULL OR unit_price >= 0); END IF; END $$;
