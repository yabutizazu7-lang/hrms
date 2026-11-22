-- 003 - Work clothing and equipment catalogue (Directive 173/2018, PDF pp. 4-27). Additive only: existing items, entitlements and issues are untouched.
ALTER TABLE ppe_items ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE ppe_items ADD COLUMN IF NOT EXISTS source_ref TEXT;
ALTER TABLE ppe_items ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE ppe_entitlements ADD COLUMN IF NOT EXISTS first_issue_quantity INT;            -- "first year N, then <quantity> each year" (Annex 3 rows for suits and ties)
ALTER TABLE ppe_entitlements ADD COLUMN IF NOT EXISTS immediate BOOLEAN NOT NULL DEFAULT FALSE;   -- Art. 7(2): chemical, health, garage and fire-fighting work are entitled from the assignment date
ALTER TABLE ppe_entitlements ADD COLUMN IF NOT EXISTS note TEXT;                           -- the quantity and applicability wording exactly as printed
ALTER TABLE ppe_entitlements ADD COLUMN IF NOT EXISTS group_no INT;                        -- Annex 3 row number
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ppe_items_category_chk') THEN
    ALTER TABLE ppe_items ADD CONSTRAINT ppe_items_category_chk CHECK (category IS NULL OR category IN ('fabric','clothing','protective_clothing','ceremonial','footwear','protective_equipment','fire_fighting','tools'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ppe_ent_first_chk') THEN
    ALTER TABLE ppe_entitlements ADD CONSTRAINT ppe_ent_first_chk CHECK (first_issue_quantity IS NULL OR first_issue_quantity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ppe_items_unit_chk') THEN
    ALTER TABLE ppe_items ADD CONSTRAINT ppe_items_unit_chk CHECK (unit IN ('piece','pair','metre'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS ppe_items_category ON ppe_items (category);
