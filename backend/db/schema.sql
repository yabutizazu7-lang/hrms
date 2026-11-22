-- Human Resource Management System - PostgreSQL schema. Idempotent (npm run db:init).
CREATE TABLE IF NOT EXISTS roles (id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, description TEXT, is_system BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE IF NOT EXISTS permissions (id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, module TEXT NOT NULL, description TEXT);
CREATE TABLE IF NOT EXISTS role_permissions (role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE, permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE, PRIMARY KEY (role_id, permission_id));

CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL CHECK (code ~ '^[A-Z0-9]{2,8}$'), name TEXT NOT NULL,
  parent_id INT REFERENCES departments(id) ON DELETE SET NULL, head_employee_id INT, active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS positions (
  id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, title TEXT NOT NULL, department_id INT REFERENCES departments(id) ON DELETE SET NULL, grade TEXT,
  min_salary NUMERIC(12,2) CHECK (min_salary IS NULL OR min_salary >= 0), max_salary NUMERIC(12,2) CHECK (max_salary IS NULL OR max_salary >= 0), active BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (min_salary IS NULL OR max_salary IS NULL OR min_salary <= max_salary)
);

CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY, employee_no TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL, father_name TEXT NOT NULL, grandfather_name TEXT,
  full_name TEXT GENERATED ALWAYS AS (first_name || ' ' || father_name || COALESCE(' ' || grandfather_name, '')) STORED,
  sex TEXT NOT NULL CHECK (sex IN ('male','female')), date_of_birth DATE, marital_status TEXT CHECK (marital_status IN ('single','married','divorced','widowed')),
  nationality TEXT DEFAULT 'Ethiopian', national_id TEXT, tin TEXT, pension_no TEXT,
  phone TEXT, email TEXT, personal_email TEXT, address TEXT, emergency_name TEXT, emergency_phone TEXT,
  hire_date DATE NOT NULL, department_id INT REFERENCES departments(id), position_id INT REFERENCES positions(id), manager_id INT REFERENCES employees(id) ON DELETE SET NULL,
  employment_type TEXT NOT NULL DEFAULT 'permanent' CHECK (employment_type IN ('permanent','contract','probation','intern','part_time')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_notice','terminated')),
  probation_end DATE, contract_end DATE, termination_date DATE,
  basic_salary NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (basic_salary >= 0), transport_allowance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (transport_allowance >= 0),
  housing_allowance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (housing_allowance >= 0), other_allowance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (other_allowance >= 0),
  bank_name TEXT, bank_account TEXT, notes TEXT, created_by INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (manager_id IS NULL OR manager_id <> id), CHECK (termination_date IS NULL OR termination_date >= hire_date)
);
CREATE INDEX IF NOT EXISTS employees_dept ON employees (department_id);
CREATE INDEX IF NOT EXISTS employees_mgr ON employees (manager_id);
CREATE INDEX IF NOT EXISTS employees_name ON employees (lower(full_name));
CREATE UNIQUE INDEX IF NOT EXISTS employees_nid_uq ON employees (national_id) WHERE national_id IS NOT NULL AND national_id <> '';
CREATE UNIQUE INDEX IF NOT EXISTS employees_email_uq ON employees (lower(email)) WHERE email IS NOT NULL AND email <> '';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_head_fk') THEN ALTER TABLE departments ADD CONSTRAINT departments_head_fk FOREIGN KEY (head_employee_id) REFERENCES employees(id) ON DELETE SET NULL; END IF; END $$;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL REFERENCES roles(code) ON UPDATE CASCADE,
  employee_id INT UNIQUE REFERENCES employees(id) ON DELETE SET NULL, active BOOLEAN NOT NULL DEFAULT TRUE, must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  failed_logins INT NOT NULL DEFAULT 0, locked_until TIMESTAMPTZ, last_login TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (lower(email));
CREATE TABLE IF NOT EXISTS password_resets (id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ);
CREATE INDEX IF NOT EXISTS password_resets_token ON password_resets (token_hash);

-- permanent record of every change to an employee's employment
CREATE TABLE IF NOT EXISTS employee_history (
  id SERIAL PRIMARY KEY, employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('hired','promotion','transfer','salary_change','status_change','contract','manager_change','separation','note')),
  from_value TEXT, to_value TEXT, effective_date DATE NOT NULL DEFAULT CURRENT_DATE, note TEXT, by_user INT REFERENCES users(id) ON DELETE SET NULL, at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employee_history_emp ON employee_history (employee_id, at);
CREATE TABLE IF NOT EXISTS employee_documents (
  id SERIAL PRIMARY KEY, employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL DEFAULT 'other' CHECK (doc_type IN ('contract','id_card','certificate','cv','offer_letter','warning','medical','tax','other')),
  title TEXT NOT NULL, filename TEXT NOT NULL, mime TEXT NOT NULL, size_bytes INT NOT NULL, sha256 TEXT NOT NULL, storage_name TEXT NOT NULL,
  expires_on DATE, confidential BOOLEAN NOT NULL DEFAULT FALSE, uploaded_by INT REFERENCES users(id) ON DELETE SET NULL, uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employee_documents_emp ON employee_documents (employee_id);

-- ------------------------------------------------------------------ recruitment
CREATE TABLE IF NOT EXISTS vacancies (
  id SERIAL PRIMARY KEY, ref_no TEXT UNIQUE NOT NULL, title TEXT NOT NULL, position_id INT REFERENCES positions(id), department_id INT REFERENCES departments(id),
  headcount INT NOT NULL DEFAULT 1 CHECK (headcount BETWEEN 1 AND 500), description TEXT, requirements TEXT, employment_type TEXT NOT NULL DEFAULT 'permanent' CHECK (employment_type IN ('permanent','contract','probation','intern','part_time')),
  location TEXT, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed','filled')), deadline DATE, posted_at TIMESTAMPTZ, created_by INT REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS applicants (
  id SERIAL PRIMARY KEY, vacancy_id INT NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE, tracking_code TEXT UNIQUE NOT NULL, full_name TEXT NOT NULL, email TEXT, phone TEXT,
  sex TEXT CHECK (sex IN ('male','female')), education TEXT, experience_years INT CHECK (experience_years IS NULL OR experience_years BETWEEN 0 AND 60), cover_note TEXT,
  cv_filename TEXT, cv_mime TEXT, cv_size INT, cv_sha256 TEXT, cv_storage TEXT,
  stage TEXT NOT NULL DEFAULT 'applied' CHECK (stage IN ('applied','screening','interview','offer','hired','rejected','withdrawn')), rejection_reason TEXT,
  employee_id INT REFERENCES employees(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS applicants_vac ON applicants (vacancy_id, stage);
CREATE TABLE IF NOT EXISTS applicant_notes (
  id SERIAL PRIMARY KEY, applicant_id INT NOT NULL REFERENCES applicants(id) ON DELETE CASCADE, user_id INT REFERENCES users(id) ON DELETE SET NULL,
  stage TEXT NOT NULL, rating INT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5), body TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ leave and attendance
CREATE TABLE IF NOT EXISTS holidays (id SERIAL PRIMARY KEY, holiday_date DATE UNIQUE NOT NULL, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS leave_types (
  id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL CHECK (code ~ '^[A-Z]{2,8}$'), name TEXT NOT NULL,
  days_per_year NUMERIC(5,1) CHECK (days_per_year IS NULL OR days_per_year >= 0),     -- NULL = no yearly limit (for example unpaid leave)
  increment_every_years INT NOT NULL DEFAULT 0 CHECK (increment_every_years >= 0), increment_days NUMERIC(4,1) NOT NULL DEFAULT 0,
  paid BOOLEAN NOT NULL DEFAULT TRUE, prorate_first_year BOOLEAN NOT NULL DEFAULT FALSE, requires_document BOOLEAN NOT NULL DEFAULT FALSE, sex_restriction TEXT CHECK (sex_restriction IN ('male','female')), min_notice_days INT NOT NULL DEFAULT 0 CHECK (min_notice_days >= 0), active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS leave_adjustments (
  id SERIAL PRIMARY KEY, employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE, leave_type_id INT NOT NULL REFERENCES leave_types(id), year INT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  days NUMERIC(5,1) NOT NULL CHECK (days <> 0), reason TEXT NOT NULL, by_user INT REFERENCES users(id) ON DELETE SET NULL, at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS leave_requests (
  id SERIAL PRIMARY KEY, employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE, leave_type_id INT NOT NULL REFERENCES leave_types(id),
  start_date DATE NOT NULL, end_date DATE NOT NULL, days NUMERIC(5,1) NOT NULL CHECK (days > 0), reason TEXT, has_document BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')), decided_by INT REFERENCES users(id) ON DELETE SET NULL, decided_at TIMESTAMPTZ, decision_note TEXT,
  created_by INT REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS leave_emp ON leave_requests (employee_id, start_date);
CREATE INDEX IF NOT EXISTS leave_status ON leave_requests (status);
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY, employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE, work_date DATE NOT NULL,
  check_in TIMESTAMPTZ, check_out TIMESTAMPTZ, minutes_late INT NOT NULL DEFAULT 0 CHECK (minutes_late >= 0), minutes_worked INT CHECK (minutes_worked IS NULL OR minutes_worked >= 0),
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','late')), source TEXT NOT NULL DEFAULT 'self' CHECK (source IN ('self','manual','correction')), note TEXT,
  UNIQUE (employee_id, work_date), CHECK (check_out IS NULL OR check_in IS NULL OR check_out >= check_in)
);
CREATE TABLE IF NOT EXISTS attendance_corrections (
  id SERIAL PRIMARY KEY, employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE, work_date DATE NOT NULL, check_in TIME, check_out TIME, reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')), decided_by INT REFERENCES users(id) ON DELETE SET NULL, decided_at TIMESTAMPTZ, decision_note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (check_in IS NOT NULL OR check_out IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- ------------------------------------------------------------------ settings and performance
CREATE TABLE IF NOT EXISTS appraisal_cycles (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK (end_date >= start_date));
CREATE TABLE IF NOT EXISTS appraisal_criteria (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, weight INT NOT NULL CHECK (weight BETWEEN 1 AND 100), active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE IF NOT EXISTS appraisals (
  id SERIAL PRIMARY KEY, cycle_id INT NOT NULL REFERENCES appraisal_cycles(id) ON DELETE CASCADE, employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE, manager_id INT REFERENCES employees(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'self' CHECK (status IN ('self','manager','hr','completed')), criteria JSONB NOT NULL DEFAULT '[]',   -- [{id,name,weight}] frozen when the cycle starts
  self_scores JSONB, manager_scores JSONB, self_comment TEXT, manager_comment TEXT, hr_comment TEXT, final_score NUMERIC(4,2), rating TEXT, completed_at TIMESTAMPTZ,
  UNIQUE (cycle_id, employee_id)
);
CREATE TABLE IF NOT EXISTS trainings (
  id SERIAL PRIMARY KEY, employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE, title TEXT NOT NULL, provider TEXT, start_date DATE, end_date DATE, cost NUMERIC(12,2) CHECK (cost IS NULL OR cost >= 0),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','completed','cancelled')), note TEXT, created_by INT REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

-- ------------------------------------------------------------------ separation and announcements
CREATE TABLE IF NOT EXISTS separations (
  id SERIAL PRIMARY KEY, employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK (kind IN ('resignation','termination','end_of_contract','retirement','dismissal')),
  notice_date DATE NOT NULL DEFAULT CURRENT_DATE, last_day DATE NOT NULL, reason TEXT, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled')),
  created_by INT REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ, CHECK (last_day >= notice_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS separations_one_open ON separations (employee_id) WHERE status = 'pending';
CREATE TABLE IF NOT EXISTS separation_clearance (id SERIAL PRIMARY KEY, separation_id INT NOT NULL REFERENCES separations(id) ON DELETE CASCADE, item TEXT NOT NULL, cleared BOOLEAN NOT NULL DEFAULT FALSE, cleared_by INT REFERENCES users(id) ON DELETE SET NULL, cleared_at TIMESTAMPTZ, note TEXT);
CREATE TABLE IF NOT EXISTS announcements (id SERIAL PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, published_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at DATE, created_by INT REFERENCES users(id) ON DELETE SET NULL);

CREATE TABLE IF NOT EXISTS audit_logs (id BIGSERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL, entity TEXT, entity_id TEXT, detail TEXT, ip TEXT, at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS audit_at ON audit_logs (at DESC);
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY, to_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','simulated')),
  attempts INT NOT NULL DEFAULT 0, error TEXT, next_try_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS notifications_queue ON notifications (status, next_try_at);
CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value BIGINT NOT NULL DEFAULT 0);

-- ------------------------------------------------------------------ integrity triggers
CREATE OR REPLACE FUNCTION touch_updated() RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS employees_touch ON employees; CREATE TRIGGER employees_touch BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION touch_updated();
DROP TRIGGER IF EXISTS applicants_touch ON applicants; CREATE TRIGGER applicants_touch BEFORE UPDATE ON applicants FOR EACH ROW EXECUTE FUNCTION touch_updated();
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'This record is append-only and cannot be changed' USING ERRCODE = 'P0001'; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_immutable ON audit_logs;        CREATE TRIGGER audit_immutable   BEFORE UPDATE OR DELETE ON audit_logs        FOR EACH ROW EXECUTE FUNCTION forbid_change();
DROP TRIGGER IF EXISTS history_immutable ON employee_history; CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON employee_history FOR EACH ROW EXECUTE FUNCTION forbid_change();
DROP TRIGGER IF EXISTS adjust_immutable ON leave_adjustments; CREATE TRIGGER adjust_immutable  BEFORE UPDATE OR DELETE ON leave_adjustments FOR EACH ROW EXECUTE FUNCTION forbid_change();
-- a completed appraisal is frozen
CREATE OR REPLACE FUNCTION protect_appraisal() RETURNS trigger AS $$ BEGIN
  IF OLD.status = 'completed' THEN RAISE EXCEPTION 'A completed appraisal cannot be changed' USING ERRCODE = 'P0001'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS appraisals_protect ON appraisals; CREATE TRIGGER appraisals_protect BEFORE UPDATE ON appraisals FOR EACH ROW EXECUTE FUNCTION protect_appraisal();
