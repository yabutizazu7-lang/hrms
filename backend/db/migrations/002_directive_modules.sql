-- 002 - Directive-based HR modules (additive and idempotent: no table is dropped, no existing column is changed or rewritten).
-- Safe to run repeatedly. Back up the database first (see docs/BACKUP_AND_RECOVERY.md).

-- ============================================================ identifiers (kept strictly separate)
-- employees.employee_no        = internal employee ID (already exists, unique)
-- staff_positions.position_no  = ቋሚ የሰራተኛ መደብ ቁጥር (permanent staff position number) - belongs to the AUTHORIZED POSITION, not to the person
-- employees.fayda_fan          = Fayda / digital ID number (FAN) - confidential, masked everywhere except for users with fayda.view
-- employees.pension_no / national_id already exist and are NOT reused for the above.
CREATE TABLE IF NOT EXISTS staff_positions (
  id SERIAL PRIMARY KEY,
  position_no TEXT NOT NULL,                       -- text on purpose: leading zeros / letters are preserved exactly as issued
  position_id INT REFERENCES positions(id) ON DELETE SET NULL,   -- job title catalogue entry
  job_title TEXT,
  department_id INT REFERENCES departments(id) ON DELETE SET NULL,
  grade TEXT,
  capacity INT NOT NULL DEFAULT 1 CHECK (capacity >= 1),         -- >1 only when an authorized staffing arrangement explicitly permits it
  capacity_authority TEXT,                         -- reference of the decision that permits capacity > 1
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','abolished')),
  verified BOOLEAN NOT NULL DEFAULT FALSE,         -- HR has verified this number against the official staffing structure
  note TEXT, created_by INT REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (capacity = 1 OR capacity_authority IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_positions_no_uq ON staff_positions (position_no);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS fayda_fan TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS fayda_status TEXT NOT NULL DEFAULT 'not_collected';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS staff_position_id INT REFERENCES staff_positions(id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS identifiers_verified BOOLEAN NOT NULL DEFAULT FALSE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_fayda_status_chk') THEN
    ALTER TABLE employees ADD CONSTRAINT employees_fayda_status_chk CHECK (fayda_status IN ('not_collected','pending_verification','verified'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS employees_staff_position ON employees (staff_position_id);
CREATE INDEX IF NOT EXISTS employees_fayda ON employees (fayda_fan) WHERE fayda_fan IS NOT NULL;   -- NOT unique: the supplied register contains repeated numbers that HR must resolve

-- a position may not hold more active employees than its (authorized) capacity
CREATE OR REPLACE FUNCTION trg_staff_position_capacity() RETURNS trigger AS $$
DECLARE cap INT; used INT; st TEXT;
BEGIN
  IF NEW.staff_position_id IS NULL OR NEW.status = 'terminated' THEN RETURN NEW; END IF;
  SELECT capacity, status INTO cap, st FROM staff_positions WHERE id = NEW.staff_position_id;
  IF st <> 'active' THEN RAISE EXCEPTION 'This staff position is % and cannot be assigned', st USING ERRCODE = 'P0001'; END IF;
  SELECT count(*) INTO used FROM employees WHERE staff_position_id = NEW.staff_position_id AND status <> 'terminated' AND id <> COALESCE(NEW.id, -1);
  IF used >= cap THEN RAISE EXCEPTION 'This staff position is already occupied (capacity %)', cap USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS employees_position_capacity ON employees;
CREATE TRIGGER employees_position_capacity BEFORE INSERT OR UPDATE OF staff_position_id, status ON employees FOR EACH ROW EXECUTE FUNCTION trg_staff_position_capacity();

-- ============================================================ generic, configurable approval workflow (modules 1, 2, 5, 6, 7, 10)
CREATE TABLE IF NOT EXISTS hr_cases (
  id SERIAL PRIMARY KEY, ref_no TEXT UNIQUE NOT NULL,
  case_type TEXT NOT NULL CHECK (case_type IN ('permanent_appointment','promotion','acting_assignment','internal_transfer','external_transfer','termination','retirement','disciplinary','long_term_education','short_term_training','experience_certificate')),
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  stage TEXT NOT NULL DEFAULT 'draft',
  initiated_by INT REFERENCES users(id) ON DELETE SET NULL, submitted_at TIMESTAMPTZ,
  assigned_reviewer INT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT, directive_ref TEXT,                   -- the governing directive / article relied on (never invented by the system)
  data JSONB NOT NULL DEFAULT '{}'::jsonb,           -- type-specific fields
  recommendation TEXT, recommended_by INT REFERENCES users(id) ON DELETE SET NULL, recommended_at TIMESTAMPTZ,
  decision TEXT CHECK (decision IN ('approved','rejected')), decision_reason TEXT, decided_by INT REFERENCES users(id) ON DELETE SET NULL, decided_at TIMESTAMPTZ,
  effective_date DATE, completed_at TIMESTAMPTZ, applied BOOLEAN NOT NULL DEFAULT FALSE,   -- applied = the approved decision has been written to the employee record
  confidential BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hr_cases_emp ON hr_cases (employee_id, case_type);
CREATE INDEX IF NOT EXISTS hr_cases_stage ON hr_cases (case_type, stage);
CREATE TABLE IF NOT EXISTS hr_case_events (          -- append-only history of every step
  id BIGSERIAL PRIMARY KEY, case_id INT NOT NULL REFERENCES hr_cases(id) ON DELETE CASCADE, action TEXT NOT NULL, from_stage TEXT, to_stage TEXT,
  note TEXT, by_user INT REFERENCES users(id) ON DELETE SET NULL, at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hr_case_documents (
  id SERIAL PRIMARY KEY, case_id INT NOT NULL REFERENCES hr_cases(id) ON DELETE CASCADE, doc_kind TEXT NOT NULL DEFAULT 'supporting', title TEXT NOT NULL,
  filename TEXT NOT NULL, mime TEXT NOT NULL, size_bytes INT NOT NULL, sha256 TEXT NOT NULL, storage_name TEXT NOT NULL,
  uploaded_by INT REFERENCES users(id) ON DELETE SET NULL, uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hr_case_documents_case ON hr_case_documents (case_id);
-- sanctions are NOT built in: the governing rules decide them, HR enters them here
CREATE TABLE IF NOT EXISTS discipline_sanctions (id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, source_ref TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE);
-- completed decisions and history can never be rewritten
CREATE OR REPLACE FUNCTION trg_hr_immutable() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'This HR record is permanent and cannot be changed or deleted' USING ERRCODE = 'P0001'; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS hr_case_events_ro ON hr_case_events;
CREATE TRIGGER hr_case_events_ro BEFORE UPDATE OR DELETE ON hr_case_events FOR EACH ROW EXECUTE FUNCTION trg_hr_immutable();
CREATE OR REPLACE FUNCTION trg_hr_case_frozen() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'HR cases cannot be deleted' USING ERRCODE = 'P0001'; END IF;
  IF OLD.stage IN ('completed','rejected','cancelled') AND (NEW.stage <> OLD.stage OR NEW.decision IS DISTINCT FROM OLD.decision OR NEW.data <> OLD.data OR NEW.effective_date IS DISTINCT FROM OLD.effective_date OR NEW.employee_id <> OLD.employee_id)
    THEN RAISE EXCEPTION 'A finished HR case cannot be changed' USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS hr_cases_frozen ON hr_cases;
CREATE TRIGGER hr_cases_frozen BEFORE UPDATE OR DELETE ON hr_cases FOR EACH ROW EXECUTE FUNCTION trg_hr_case_frozen();

-- ============================================================ module 3: work experience and service history
CREATE TABLE IF NOT EXISTS service_periods (
  id SERIAL PRIMARY KEY, employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employer TEXT NOT NULL, department TEXT, job_title TEXT, grade TEXT, employment_type TEXT,
  start_date DATE NOT NULL, end_date DATE,            -- end_date NULL = still ongoing
  is_current_institution BOOLEAN NOT NULL DEFAULT FALSE,
  verified BOOLEAN NOT NULL DEFAULT FALSE, verified_by INT REFERENCES users(id) ON DELETE SET NULL, verified_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','register','system')),
  interruption_note TEXT, document_id INT REFERENCES employee_documents(id) ON DELETE SET NULL, note TEXT,
  created_by INT REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS service_periods_emp ON service_periods (employee_id, start_date);

-- ============================================================ module 9: uniforms and work equipment (Directive 173/2018)
CREATE TABLE IF NOT EXISTS ppe_items (
  id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name_am TEXT, name_en TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('clothing','footwear','equipment')),
  unit TEXT NOT NULL DEFAULT 'piece', immediate_eligibility BOOLEAN NOT NULL DEFAULT FALSE, active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS ppe_entitlements (        -- what a position/job title is approved to receive (Annex 3). Entered by HR from the directive; no quantities are built in.
  id SERIAL PRIMARY KEY, job_title_pattern TEXT NOT NULL, item_id INT NOT NULL REFERENCES ppe_items(id) ON DELETE CASCADE, quantity INT NOT NULL CHECK (quantity > 0),
  per_months INT CHECK (per_months IS NULL OR per_months > 0),   -- replacement period; NULL = once per budget year
  source_ref TEXT NOT NULL, verified BOOLEAN NOT NULL DEFAULT FALSE, active BOOLEAN NOT NULL DEFAULT TRUE, UNIQUE (job_title_pattern, item_id)
);
CREATE TABLE IF NOT EXISTS ppe_stock_moves (          -- stock ledger; balance = sum(qty)
  id BIGSERIAL PRIMARY KEY, item_id INT NOT NULL REFERENCES ppe_items(id), move_type TEXT NOT NULL CHECK (move_type IN ('receive','issue','return','adjust')), qty INT NOT NULL CHECK (qty <> 0),
  ref TEXT, note TEXT, by_user INT REFERENCES users(id) ON DELETE SET NULL, at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ppe_issues (
  id SERIAL PRIMARY KEY, employee_id INT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT, item_id INT NOT NULL REFERENCES ppe_items(id), quantity INT NOT NULL CHECK (quantity > 0),
  fiscal_year INT NOT NULL, issued_on DATE NOT NULL DEFAULT CURRENT_DATE, issued_by INT REFERENCES users(id) ON DELETE SET NULL,
  entitlement_id INT REFERENCES ppe_entitlements(id) ON DELETE SET NULL, replacement BOOLEAN NOT NULL DEFAULT FALSE, replacement_reason TEXT,
  acknowledged_at TIMESTAMPTZ, acknowledged_by INT REFERENCES users(id) ON DELETE SET NULL,
  condition_note TEXT, returned_on DATE, return_condition TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ppe_issues_emp ON ppe_issues (employee_id, fiscal_year);

-- ============================================================ module 11: continuous annual HR plan
CREATE TABLE IF NOT EXISTS hr_plans (
  id SERIAL PRIMARY KEY, fiscal_year INT NOT NULL, title TEXT NOT NULL, objectives TEXT, institutional_goals TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','implementing','evaluated')),
  approved_budget NUMERIC(14,2) CHECK (approved_budget IS NULL OR approved_budget >= 0), approved_by INT REFERENCES users(id) ON DELETE SET NULL, approved_at TIMESTAMPTZ,
  year_end_evaluation TEXT, achievement_pct NUMERIC(5,2) CHECK (achievement_pct IS NULL OR achievement_pct BETWEEN 0 AND 100),
  created_by INT REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (fiscal_year, title)
);
CREATE TABLE IF NOT EXISTS hr_plan_items (
  id SERIAL PRIMARY KEY, plan_id INT NOT NULL REFERENCES hr_plans(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('recruitment','training','succession','promotion_transfer','retirement_forecast','leave_coverage','other')),
  description TEXT NOT NULL, responsible_department_id INT REFERENCES departments(id) ON DELETE SET NULL, responsible_employee_id INT REFERENCES employees(id) ON DELETE SET NULL,
  planned_start DATE, planned_end DATE, indicator TEXT, target NUMERIC(14,2), budget NUMERIC(14,2) CHECK (budget IS NULL OR budget >= 0),
  CHECK (planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start)
);
CREATE TABLE IF NOT EXISTS hr_plan_progress (
  id SERIAL PRIMARY KEY, item_id INT NOT NULL REFERENCES hr_plan_items(id) ON DELETE CASCADE, period TEXT NOT NULL,   -- e.g. 2019-Q1 / 2019-M03
  achieved NUMERIC(14,2), note TEXT, challenges TEXT, corrective_action TEXT, evidence TEXT, reported_by INT REFERENCES users(id) ON DELETE SET NULL, at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (item_id, period)
);

-- ============================================================ register reconciliation (reversible imports)
CREATE TABLE IF NOT EXISTS import_batches (
  id SERIAL PRIMARY KEY, source_file TEXT NOT NULL, mode TEXT NOT NULL CHECK (mode IN ('preview','apply')), inserted INT NOT NULL DEFAULT 0, updated INT NOT NULL DEFAULT 0, skipped INT NOT NULL DEFAULT 0, failed INT NOT NULL DEFAULT 0,
  rolled_back_at TIMESTAMPTZ, by_user INT REFERENCES users(id) ON DELETE SET NULL, at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS import_rows (
  id SERIAL PRIMARY KEY, batch_id INT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE, source_row INT NOT NULL, action TEXT NOT NULL CHECK (action IN ('insert','update','skip','fail')),
  employee_id INT REFERENCES employees(id) ON DELETE SET NULL, issues TEXT[] NOT NULL DEFAULT '{}', before JSONB   -- before = values that an update replaced (empty fields only), used for rollback
);
-- fields HR must verify (flags raised by the import and by validation)
CREATE TABLE IF NOT EXISTS verification_flags (
  id SERIAL PRIMARY KEY, employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE, field TEXT NOT NULL, issue TEXT NOT NULL, resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_by INT REFERENCES users(id) ON DELETE SET NULL, resolved_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (employee_id, field, issue)
);

-- ============================================================ leave-case audit link (module 8 additions)
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS return_to_work_on DATE;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- external transfer OUT is recorded as a separation so that clearance and handover are not skipped
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'separations_kind_check') THEN ALTER TABLE separations DROP CONSTRAINT separations_kind_check; END IF;
  ALTER TABLE separations ADD CONSTRAINT separations_kind_check CHECK (kind IN ('resignation','termination','end_of_contract','retirement','dismissal','transfer_out'));
END $$;
