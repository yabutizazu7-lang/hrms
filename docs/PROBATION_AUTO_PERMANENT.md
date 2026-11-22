# Probationary (Trial Period) and automatic permanent employment

## Current staff
Migration `015_all_staff_permanent_auto_probation.sql` (runs once with `npm run db:init`) makes **every current, non-terminated employee permanent**: `employment_type='permanent'`, `probation_end` and `contract_end` cleared, open probation reviews closed. The previous type (and a previous contract end date) is kept in each employee's history (`employment_history`, kind *contract*). Terminated employees and employees who were already permanent are not touched. Running it twice changes nothing.

## New employees
* Registration (*Register an employee*, and *Hire this applicant* in Recruitment) offers **one** option: **Probationary (Trial Period)**. The server enforces it: any other type is refused (HTTP 400); recruitment hires are always probationary.
* The completion date is calculated from the start date (`probation_months`, 6) and cannot be shortened by typing an earlier date.
* **After six months of service the employee becomes permanent automatically** (scheduled check at start and every 6 hours; also immediately when someone is registered with a start date six months or more in the past). It is recorded as an automatic confirmation (*System (automatic)*, effective on the completion date) and in the employee history. No HR decision is needed. An extended probation date is respected.

## Switch
Setting `probation_auto_permanent` (System settings): `1` = automatic (default), `0` = the earlier behaviour (HR is notified and confirms or declines each case). Switching back to `1` converts waiting cases and closes their reviews.

## Not changed
Existing employees' types can still be edited by HR (e.g. to record a contract). Vacancy postings keep their own "employment type" label. The register importer still reads types from the register file.

## Tests
`npm run test:permanent` (36 checks). Older suites that registered new employees as "permanent" were updated to rely on old start dates (which become permanent automatically); the probation suite runs in manual mode.
