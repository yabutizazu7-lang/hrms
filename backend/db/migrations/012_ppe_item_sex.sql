-- 012 - Items the directive names "for men" / "for women" are only for that sex. Additive: one nullable column; filled only from the directive's own item names.
ALTER TABLE ppe_items ADD COLUMN IF NOT EXISTS applies_to_sex TEXT;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ppe_items_sex_chk') THEN ALTER TABLE ppe_items ADD CONSTRAINT ppe_items_sex_chk CHECK (applies_to_sex IS NULL OR applies_to_sex IN ('male','female')); END IF; END $$;
UPDATE ppe_items SET applies_to_sex = 'male'   WHERE applies_to_sex IS NULL AND name_am ~ 'ለወንድ|ለወንዶች';
UPDATE ppe_items SET applies_to_sex = 'female' WHERE applies_to_sex IS NULL AND name_am ~ 'ለሴት|ለሴቶች';
