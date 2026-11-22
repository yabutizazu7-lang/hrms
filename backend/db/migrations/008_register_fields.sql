-- 008 - The 27 columns of the employee register (Nehase 2018 register) as real employee fields. Additive only: no existing row, column or relation is changed.
-- Already stored before this migration: FAN (fayda_fan), sex, pension_no, date_of_birth, hire_date, marital_status, basic_salary, employment_type, department_id, position_id.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS register_no INT;                  -- 1  ተ.ቁ   the original serial number of the register (NOT a key; ordering only)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS full_name_am TEXT;                -- 3  ስም ከነአያት በአማርኛ   exactly as written in the register
ALTER TABLE employees ADD COLUMN IF NOT EXISTS full_name_en TEXT;                -- 4  ስም ከነአያት በእንግሊዘኛ   exactly as written in the register
ALTER TABLE employees ADD COLUMN IF NOT EXISTS workplace TEXT;                   -- 6  የሚሰሩበት ተቋም / መስሪያ ቤት
ALTER TABLE employees ADD COLUMN IF NOT EXISTS ethnicity TEXT;                   -- 10 ብሔር / ብሔረሰብ
ALTER TABLE employees ADD COLUMN IF NOT EXISTS education_field TEXT;             -- 11 የትምህርት ዓይነት
ALTER TABLE employees ADD COLUMN IF NOT EXISTS education_level TEXT;             -- 12 የትምህርት ደረጃ   (text as in the register: ድግሪ, 2ኛ ድግሪ, ደረጃ 4 ...)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS prior_service_text TEXT;          -- 14 የአገልግሎት ዘመን በሌላ መ/ቤት   (kept as written: "2 አመት ከ11 ወር")
ALTER TABLE employees ADD COLUMN IF NOT EXISTS institution_service_text TEXT;    -- 15 የአገልግሎት ዘመን በመ/ቤቱ
ALTER TABLE employees ADD COLUMN IF NOT EXISTS total_service_text TEXT;          -- 16 ጠቅላላ የአገልግሎት ዘመን
ALTER TABLE employees ADD COLUMN IF NOT EXISTS child1_dob DATE;                  -- 18 የልጅ 1 የልደት ቀን
ALTER TABLE employees ADD COLUMN IF NOT EXISTS child2_dob DATE;                  -- 19 የልጅ 2 የልደት ቀን
ALTER TABLE employees ADD COLUMN IF NOT EXISTS jeg_title TEXT;                   -- 20 የሥራ መደብ መጠሪያ በJEG   (also linked to positions when the title exists there)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_grade TEXT;                   -- 21 የሥራ መደብ ደረጃ
ALTER TABLE employees ADD COLUMN IF NOT EXISTS newly_hired_fy BOOLEAN NOT NULL DEFAULT FALSE;   -- 23 በበጀት ዓመቱ አዲስ የተቀጠሩ   (√ = true; an empty cell = not marked)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS promoted_fy BOOLEAN NOT NULL DEFAULT FALSE;      -- 24 በበጀት ዓመቱ ደረጃ ዕድገት ያገኙ
ALTER TABLE employees ADD COLUMN IF NOT EXISTS disability TEXT;                  -- 25 የአካል ጉዳት ሁኔታና ዓይነት   (empty = none recorded)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS long_term_training TEXT;          -- 26 የረጅም ጊዜ ሥልጠና አገርና ደረጃ
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_register_no_chk') THEN ALTER TABLE employees ADD CONSTRAINT employees_register_no_chk CHECK (register_no IS NULL OR register_no > 0); END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS employees_register_no ON employees (register_no) WHERE register_no IS NOT NULL;   -- one register number per employee; empty is allowed
CREATE INDEX IF NOT EXISTS employees_education_level ON employees (education_level);
CREATE INDEX IF NOT EXISTS employees_job_grade ON employees (job_grade);
CREATE INDEX IF NOT EXISTS employees_full_name_am ON employees (lower(full_name_am));
