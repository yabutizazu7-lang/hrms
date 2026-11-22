# Payroll removed · Permanent employment after probation

## 1. Payroll removal
Removed: the Payroll module (runs, payslips, loans, tax brackets) from the API (`routes/payroll.js`, `/tax-brackets`), the screens (`Payroll.jsx`, menu, routes, dashboard cards, "My payslips", payroll report, payroll settings), the permissions `payroll.view/run/approve/pay` and `loans.manage`, the **Payroll Officer** role, payroll translations (English and Amharic) and the payroll parts of the tests and demo data.

Kept untouched: everything in `employees` (basic salary, allowances, bank, pension number, TIN), the permissions `salary.view` / `salary.manage`, the salary-change history, and all other modules.

Database (migration `006_remove_payroll.sql`) - safe by construction:
* `payslips`, `payroll_runs`, `loans`, `tax_brackets` are dropped **only if payslips, runs and loans hold no rows**. If any row exists the tables are left exactly as they are and a notice is printed.
* Payroll-only permissions are removed; the `payroll_officer` role is removed only if no account holds it.
* The payroll-only settings (pension rates, tax-free limit, deduction cap) are removed together with the tables.
* Separation clearance keeps its manual finance item ("loans and advances settled"); it no longer checks a loans table.
* The old "Payroll settings" page is now **System settings** (organisation, leave, working hours, probation period).

## 2. Permanent employment after probation
**Rule.** An employee registered as *Probation* completes the probation period on `start date + N months` (N = setting `probation_months`, default **6**; 1-24). Month ends are clamped (31 Aug + 6 months = 28/29 Feb), leap years are handled, and the calculation is the same as PostgreSQL's `date + interval '6 months'` (tested on 1 500 dates). The date is **calculated only in the backend**; the screens display it. Eligible = today ≥ completion date. Nothing is converted automatically.

**Workflow.**
1. Register: start date (`hire_date`) + type *Probation* → completion date calculated and stored (`probation_end`). A typed date is ignored. Editing the profile never resets it.
2. Before the date: profile shows start date, completion date, remaining days, "not yet eligible".
3. On the date: the scheduled check (every 6 h and at start-up; also "Check now") raises **one** review per completion date and e-mails (English + Amharic) the HR officers/managers (permission `employment.confirm`) and administrators. The notification is claimed once, so a repeated or parallel run sends nothing more.
4. HR clicks **Confirm Permanent Employment** (effective date, remarks) → type becomes *Permanent*; effective date, approval date, approving officer and remarks are stored; the employment history gets a status-change entry; the action is audited.
5. Or **Not approved**: reason, next action (extend probation with a new review date / start separation / other), remarks. Extending moves the completion date; the decision stays in the history. HR may still confirm later (both decisions remain).
6. Nobody can decide their own case; only `employment.confirm` holders (HR Manager, HR Officer by default) can decide. Administrators are notified but cannot confirm unless granted the permission.
7. HR can correct the start date (`employees.manage`) **with a mandatory reason**: history entry, audit entry, completion date recalculated, open review cancelled and raised again by the check.

The existing HR case "Permanent appointment" (multi-stage approval) still works; when it completes it closes the review too.

**Where.** Menu *Probation and permanent employment* (page with 4 numbers, tabs, filters); employee profile section *Permanent employment*; employee list (filters: department, type, status, employed from/to, permanent-employment status; column *Probation*); HR dashboard cards. Numbers: *Approaching six months* (within `alert_days`), *Pending Approval*, *Confirmed permanent*, *Decisions pending* (declined, not yet re-decided).

**Database (migration `007_permanent_employment.sql`).** Table `permanent_reviews` (one row per review; unique open review per employee; statuses pending / confirmed / not_approved / cancelled), setting `probation_months`, permission `employment.confirm` (granted once to HR Manager and HR Officer on upgrade).

**Scope limit.** Only employees whose type is *Probation* are tracked. Contract, intern and part-time types are not. All 205 imported register employees are *Permanent*, so no notification is raised for them.

## 3. Commands
```
cd backend
npm run db:init          # applies 006 and 007 (additive; payroll tables dropped only if empty)
npm run dev
# development database only:
npm run seed:demo && npm test      # e2e, directive, ppe, probation, import, migration
cd ../frontend && npm run i18n:check && npm run i18n:check-directive && npm run build
```
Backup first: `pg_dump -Fc hrms > before_006_007.dump`; restore with `pg_restore -d hrms_new before_006_007.dump`.
