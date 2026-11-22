-- 011 - Uniform and work-tool entitlements by job title: the link between the college's job titles and the occupations named in Directive No. 173/2018 (Annex 3),
-- and the records HR needs when it issues beyond the authorized quantity. Additive only: items, entitlements, stock and issue history are untouched.
CREATE TABLE IF NOT EXISTS ppe_title_map (
  id SERIAL PRIMARY KEY,
  college_title TEXT NOT NULL,                       -- the title as it is on the employee's position
  annex_pattern TEXT NOT NULL,                       -- the occupation as written in the directive (ppe_entitlements.job_title_pattern)
  group_no INT,
  basis TEXT NOT NULL CHECK (basis IN ('automatic_exact','automatic_equivalent','hr_confirmed')),
  note TEXT, active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), deactivated_by INT REFERENCES users(id) ON DELETE SET NULL, deactivated_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS ppe_title_map_unique ON ppe_title_map (college_title, annex_pattern);
CREATE INDEX IF NOT EXISTS ppe_title_map_title ON ppe_title_map (college_title) WHERE active;
CREATE TABLE IF NOT EXISTS ppe_mapping_runs (   -- every run of the matching process, with its numbers (the report)
  id SERIAL PRIMARY KEY, run_at TIMESTAMPTZ NOT NULL DEFAULT now(), run_by INT REFERENCES users(id) ON DELETE SET NULL,
  employees INT NOT NULL, matched INT NOT NULL, review INT NOT NULL, titles INT NOT NULL, titles_matched INT NOT NULL, titles_review INT NOT NULL, links_added INT NOT NULL DEFAULT 0
);
-- what an issue was based on, and the documented exception when it goes beyond the authorized quantity or the waiting period
ALTER TABLE ppe_issues ADD COLUMN IF NOT EXISTS job_title_at_issue TEXT;
ALTER TABLE ppe_issues ADD COLUMN IF NOT EXISTS authorized_quantity INT;
ALTER TABLE ppe_issues ADD COLUMN IF NOT EXISTS exception_reason TEXT;
ALTER TABLE ppe_issues ADD COLUMN IF NOT EXISTS exception_ref TEXT;
ALTER TABLE ppe_issues ADD COLUMN IF NOT EXISTS exception_by INT REFERENCES users(id) ON DELETE SET NULL;
