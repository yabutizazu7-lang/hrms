-- 014 - Retirement management (ጡረታ). Additive only: nothing is deleted or rewritten.
-- Ages are NEVER stored: they are calculated from employees.date_of_birth on every request. What is stored here is the evidence of what the system
-- did (which employee reached 59 / 60 and when HR was told) and the retirement letters that were issued.

-- one row per employee and milestone: the unique key is what prevents duplicate notifications, even if two server instances run the check at once
CREATE TABLE IF NOT EXISTS retirement_milestones (
  id SERIAL PRIMARY KEY, employee_id INT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  milestone TEXT NOT NULL CHECK (milestone IN ('approaching','eligible')),
  reached_on DATE NOT NULL,                      -- the date the employee reached that age (date of birth + 59 / 60 years)
  retirement_age INT NOT NULL,                   -- the configured retirement age at that time (setting retirement_age_years)
  raised_at TIMESTAMPTZ NOT NULL DEFAULT now(), notified_at TIMESTAMPTZ,
  UNIQUE (employee_id, milestone)
);
-- the retirement letter: one per retirement case, never changed afterwards (the PDF is also kept in the employee's personnel file)
CREATE TABLE IF NOT EXISTS retirement_letters (
  id SERIAL PRIMARY KEY, case_id INT NOT NULL UNIQUE REFERENCES hr_cases(id) ON DELETE RESTRICT, employee_id INT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  ref_no TEXT UNIQUE NOT NULL, language TEXT NOT NULL DEFAULT 'am' CHECK (language IN ('am','en','both')), snapshot JSONB NOT NULL,
  issued_by INT REFERENCES users(id) ON DELETE SET NULL, issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pdf_storage TEXT NOT NULL, pdf_sha256 TEXT NOT NULL, pdf_size INT NOT NULL, document_id INT REFERENCES employee_documents(id) ON DELETE SET NULL
);
DROP TRIGGER IF EXISTS retirement_letters_ro ON retirement_letters;
CREATE TRIGGER retirement_letters_ro BEFORE UPDATE OR DELETE ON retirement_letters FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- no accidental duplicate retirement records: one open retirement case and one completed retirement case per employee (database level).
-- Created only when the existing data has no duplicates, so the upgrade can never fail on old records.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM hr_cases WHERE case_type='retirement' AND stage NOT IN ('completed','rejected','cancelled') GROUP BY employee_id HAVING count(*)>1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS hr_cases_one_open_retirement ON hr_cases (employee_id) WHERE case_type='retirement' AND stage NOT IN ('completed','rejected','cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hr_cases WHERE case_type='retirement' AND stage='completed' GROUP BY employee_id HAVING count(*)>1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS hr_cases_one_completed_retirement ON hr_cases (employee_id) WHERE case_type='retirement' AND stage='completed';
  END IF;
END $$;
