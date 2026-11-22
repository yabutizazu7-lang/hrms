-- 007 - Permanent employment after the probation period (six months by default; the length is the setting `probation_months`).
-- Additive only: employees, employment_type, hire_date and probation_end are reused. One row per review; the history of decisions is kept.
CREATE TABLE IF NOT EXISTS permanent_reviews (
  id SERIAL PRIMARY KEY,
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,                                   -- the six-month completion date this review was raised for
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','not_approved','cancelled')),
  raised_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at TIMESTAMPTZ,                                  -- set once, by whoever claims the notification first (no duplicates)
  decided_at TIMESTAMPTZ, decided_by INT REFERENCES users(id) ON DELETE SET NULL, decided_by_name TEXT,
  effective_date DATE,                                      -- confirmed: the date permanent employment starts
  remarks TEXT,
  reason TEXT, next_action TEXT CHECK (next_action IS NULL OR next_action IN ('extend_probation','start_separation','other')), next_review_date DATE,
  CHECK (status <> 'confirmed' OR effective_date IS NOT NULL),
  CHECK (status <> 'not_approved' OR (reason IS NOT NULL AND next_action IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS permanent_reviews_period ON permanent_reviews (employee_id, due_date);   -- the scheduled check never raises a review for a period that already has one
CREATE UNIQUE INDEX IF NOT EXISTS permanent_reviews_open ON permanent_reviews (employee_id) WHERE status = 'pending';   -- at most one open review per employee
CREATE INDEX IF NOT EXISTS permanent_reviews_status ON permanent_reviews (status, due_date);
CREATE INDEX IF NOT EXISTS employees_hire_date ON employees (hire_date);
INSERT INTO settings(key, value) VALUES ('probation_months', '6') ON CONFLICT DO NOTHING;
