-- 009 - Approval authorities: the selectable "who takes the final decision" options for HR cases, the HR (የሰው ሀብት) authority, named HR officers
-- designated to decide for HR, and case forwarding to a higher authority. Additive only: case_approval_rules, existing cases and permissions are untouched.
CREATE TABLE IF NOT EXISTS approval_authorities (
  permission TEXT PRIMARY KEY,                       -- the permission its holders need; this is exactly the value stored in case_approval_rules.approver_permission
  name_en TEXT NOT NULL, name_am TEXT NOT NULL,
  is_hr BOOLEAN NOT NULL DEFAULT FALSE,              -- the HR authority (can forward to the others)
  active BOOLEAN NOT NULL DEFAULT TRUE, sort INT NOT NULL DEFAULT 0
);
INSERT INTO approval_authorities(permission,name_en,name_am,is_hr,sort) VALUES
  ('cases.approve',    'Authorized final decision-maker (institution management)', 'ሥልጣን ያለው የመጨረሻ ውሳኔ ሰጪ (የተቋሙ አመራር)', FALSE, 10),
  ('discipline.decide','Authorized disciplinary decision-maker',                   'ሥልጣን ያለው የዲስፕሊን ውሳኔ ሰጪ',               FALSE, 20),
  ('cases.decide_hr',  'Human Resources (HR)',                                     'የሰው ሀብት',                                    TRUE,  30)
ON CONFLICT DO NOTHING;
-- named HR officers designated (in writing) to decide for the HR authority; nobody gets this automatically
CREATE TABLE IF NOT EXISTS authority_delegates (
  id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE, permission TEXT NOT NULL DEFAULT 'cases.decide_hr' REFERENCES approval_authorities(permission),
  source_ref TEXT NOT NULL,                          -- reference of the official designation (letter / minute)
  note TEXT, granted_by INT REFERENCES users(id) ON DELETE SET NULL, granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ, revoked_by INT REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS authority_delegates_active ON authority_delegates (user_id, permission) WHERE revoked_at IS NULL;
-- forwarding: the case is decided by another authority than the one configured for its type
ALTER TABLE hr_cases ADD COLUMN IF NOT EXISTS authority_override TEXT;
ALTER TABLE hr_cases ADD COLUMN IF NOT EXISTS forwarded_by INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE hr_cases ADD COLUMN IF NOT EXISTS forwarded_at TIMESTAMPTZ;
ALTER TABLE hr_cases ADD COLUMN IF NOT EXISTS forward_note TEXT;
