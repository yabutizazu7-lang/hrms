-- 015 - (1) every CURRENT employee becomes permanent (decision of the organisation: the existing 205 staff are permanent employees);
--       (2) new employees start as "Probationary (Trial Period)" and become permanent automatically after six months of service (setting probation_auto_permanent).
-- One-time data change, recorded in each employee's history (the previous type is kept there). Terminated employees are not touched. Nothing is deleted.
INSERT INTO employee_history(employee_id, kind, from_value, to_value, note, effective_date)
  SELECT id, 'contract', employment_type, 'permanent', 'Employment type set to permanent for all current staff' || CASE WHEN contract_end IS NOT NULL THEN ' (previous contract end date ' || contract_end::text || ')' ELSE '' END, CURRENT_DATE
  FROM employees WHERE status <> 'terminated' AND employment_type <> 'permanent';
UPDATE permanent_reviews SET status = 'cancelled', decided_at = now(), remarks = COALESCE(remarks || ' | ', '') || 'Closed: all current staff were made permanent'
  WHERE status = 'pending' AND employee_id IN (SELECT id FROM employees WHERE status <> 'terminated' AND employment_type <> 'permanent');
UPDATE employees SET employment_type = 'permanent', probation_end = NULL, contract_end = NULL, updated_at = now() WHERE status <> 'terminated' AND employment_type <> 'permanent';
INSERT INTO settings(key, value) VALUES ('probation_auto_permanent', '1') ON CONFLICT DO NOTHING;   -- 1 = automatic after the probation period, 0 = HR confirms each case (the earlier behaviour)
