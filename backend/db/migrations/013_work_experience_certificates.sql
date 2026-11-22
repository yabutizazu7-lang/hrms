-- 013 - Work Experience Certificate (የሥራ ልምድ ማስረጃ). Additive only: no existing table, column, row or permission is changed.
-- A certificate can only be prepared for an employee whose Recommendation Letter (HR case type 'recommendation_letter') has been officially
-- issued (stage 'completed'). The certificate is approved and issued by the HR authority (permission cases.decide_hr) and is then frozen.

-- the HR case type of the Recommendation Letter (ምክረ ሐሳብ): the list of allowed case types gets one more value, nothing else about hr_cases changes
ALTER TABLE hr_cases DROP CONSTRAINT IF EXISTS hr_cases_case_type_check;
ALTER TABLE hr_cases ADD CONSTRAINT hr_cases_case_type_check CHECK (case_type IN ('permanent_appointment','promotion','acting_assignment','internal_transfer','external_transfer','termination','retirement','disciplinary','long_term_education','short_term_training','experience_certificate','recommendation_letter'));

-- the certificate itself: one row per certificate, issued ones are permanent records
CREATE TABLE IF NOT EXISTS work_certificates (
  id SERIAL PRIMARY KEY,
  ref_no TEXT UNIQUE NOT NULL,                                                   -- WEC-2026-00001 (yearly sequence, table counters)
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  recommendation_case_id INT NOT NULL REFERENCES hr_cases(id) ON DELETE RESTRICT, -- the issued Recommendation Letter that enabled this certificate
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','superseded','cancelled')),
  language TEXT NOT NULL DEFAULT 'am' CHECK (language IN ('am','en','both')),
  responsibilities TEXT,                                                          -- work responsibilities: typed by HR (no source for them exists in the employee record)
  snapshot JSONB NOT NULL,                                                        -- the employee data exactly as it was read from the database; frozen when issued
  generated_by INT REFERENCES users(id) ON DELETE SET NULL, generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by INT REFERENCES users(id) ON DELETE SET NULL, approved_by_name TEXT, approved_by_title TEXT, approved_at TIMESTAMPTZ,
  issue_date DATE,
  supersedes_id INT REFERENCES work_certificates(id) ON DELETE RESTRICT, reissue_reason TEXT,   -- a second certificate needs a reason from the HR authority
  cancelled_by INT REFERENCES users(id) ON DELETE SET NULL, cancelled_at TIMESTAMPTZ, cancel_reason TEXT,
  pdf_storage TEXT, pdf_sha256 TEXT, pdf_size INT,                                -- the issued PDF (folder uploads/emp/<employee id>, SHA-256 checked on every download)
  document_id INT REFERENCES employee_documents(id) ON DELETE SET NULL,           -- the same PDF in the employee's personnel file
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'issued' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND issue_date IS NOT NULL AND pdf_sha256 IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS work_certificates_emp ON work_certificates (employee_id, status);
CREATE INDEX IF NOT EXISTS work_certificates_status ON work_certificates (status, issue_date DESC);
-- at most ONE issued and ONE draft certificate per employee: duplicate issuance is impossible even if two people click at the same moment
CREATE UNIQUE INDEX IF NOT EXISTS work_certificates_one_issued ON work_certificates (employee_id) WHERE status = 'issued';
CREATE UNIQUE INDEX IF NOT EXISTS work_certificates_one_draft ON work_certificates (employee_id) WHERE status = 'draft';

-- append-only history of every step (generated, edited, refreshed, issued, superseded, cancelled, downloaded)
CREATE TABLE IF NOT EXISTS work_certificate_events (
  id BIGSERIAL PRIMARY KEY, certificate_id INT NOT NULL REFERENCES work_certificates(id) ON DELETE RESTRICT, action TEXT NOT NULL,
  from_status TEXT, to_status TEXT, note TEXT, by_user INT REFERENCES users(id) ON DELETE SET NULL, at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_certificate_events_cert ON work_certificate_events (certificate_id, id);
DROP TRIGGER IF EXISTS work_certificate_events_ro ON work_certificate_events;
CREATE TRIGGER work_certificate_events_ro BEFORE UPDATE OR DELETE ON work_certificate_events FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- certificates are permanent: never deleted; an issued certificate keeps its content and can only be superseded or cancelled; closed ones never change again
CREATE OR REPLACE FUNCTION trg_work_certificate_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A certificate is a permanent record and cannot be deleted' USING ERRCODE = 'P0001'; END IF;
  IF OLD.status IN ('superseded','cancelled') THEN RAISE EXCEPTION 'This certificate is closed and cannot be changed' USING ERRCODE = 'P0001'; END IF;
  IF OLD.status = 'issued' THEN
    IF NEW.status NOT IN ('issued','superseded','cancelled') THEN RAISE EXCEPTION 'An issued certificate cannot go back to draft' USING ERRCODE = 'P0001'; END IF;
    IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.employee_id <> OLD.employee_id OR NEW.ref_no <> OLD.ref_no OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
       OR NEW.pdf_sha256 IS DISTINCT FROM OLD.pdf_sha256 OR NEW.responsibilities IS DISTINCT FROM OLD.responsibilities OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.language <> OLD.language THEN
      RAISE EXCEPTION 'An issued certificate cannot be edited. Issue a new one (reason required) or cancel it' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS work_certificates_guard ON work_certificates;
CREATE TRIGGER work_certificates_guard BEFORE UPDATE OR DELETE ON work_certificates FOR EACH ROW EXECUTE FUNCTION trg_work_certificate_guard();

-- signature (one per HR manager account) and official stamp (one for the organisation): PNG or JPEG files uploaded by the HR authority.
-- The system never draws a signature or stamp by itself; when none is uploaded the PDF shows an empty signature / stamp area.
CREATE TABLE IF NOT EXISTS certificate_assets (
  id SERIAL PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('signature','stamp')), user_id INT REFERENCES users(id) ON DELETE CASCADE,   -- user_id is set for signatures only
  filename TEXT NOT NULL, mime TEXT NOT NULL CHECK (mime IN ('image/png','image/jpeg')), size_bytes INT NOT NULL, sha256 TEXT NOT NULL, storage_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE, uploaded_by INT REFERENCES users(id) ON DELETE SET NULL, uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((kind = 'signature' AND user_id IS NOT NULL) OR (kind = 'stamp' AND user_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS certificate_assets_one_signature ON certificate_assets (user_id) WHERE kind = 'signature' AND active;
CREATE UNIQUE INDEX IF NOT EXISTS certificate_assets_one_stamp ON certificate_assets (kind) WHERE kind = 'stamp' AND active;
