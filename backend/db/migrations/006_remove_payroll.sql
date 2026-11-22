-- 006 - Payroll module removed. Employee salary, allowance, bank and pension-number columns on `employees` are NOT touched.
-- The payroll tables are dropped only when they hold no rows. If any payroll run, payslip or loan exists, every table is kept exactly as it is.
DO $$
DECLARE n BIGINT := 0;
BEGIN
  IF to_regclass('public.payslips') IS NOT NULL THEN n := n + (SELECT count(*) FROM payslips); END IF;
  IF to_regclass('public.payroll_runs') IS NOT NULL THEN n := n + (SELECT count(*) FROM payroll_runs); END IF;
  IF to_regclass('public.loans') IS NOT NULL THEN n := n + (SELECT count(*) FROM loans); END IF;
  IF n = 0 THEN
    DROP TABLE IF EXISTS payslips, payroll_runs, loans, tax_brackets CASCADE;
    DROP FUNCTION IF EXISTS protect_payslip() CASCADE;
    DELETE FROM settings WHERE key IN ('pension_employee', 'pension_employer', 'transport_tax_free_limit', 'max_deduction_share');
  ELSE
    RAISE NOTICE 'Payroll tables hold % rows - they were kept unchanged. Export them, then drop them by hand when no longer needed.', n;
  END IF;
  DELETE FROM permissions WHERE code IN ('payroll.view', 'payroll.run', 'payroll.approve', 'payroll.pay', 'loans.manage');
  DELETE FROM roles r WHERE r.code = 'payroll_officer' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.role = 'payroll_officer');
END $$;
