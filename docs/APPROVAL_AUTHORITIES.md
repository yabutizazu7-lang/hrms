# HR has exclusive authority (clarification of the college)

The Human Resources (HR) department alone processes and takes the final decision on these 15 matters. No executive, institution-management, department-head or other department approval is required, nothing is forwarded to anyone, and no workflow is left "unconfirmed".

| # | Matter | Processed by | Final decision by | Where |
|---|---|---|---|---|
| 1-11 | Acting assignment, disciplinary, experience certificate, external transfer, internal transfer, long-term education, permanent appointment, promotion, retirement, short-term training, termination | HR staff with `cases.manage` (disciplinary: `discipline.manage`) | HR authority = `cases.decide_hr` | HR cases |
| 12 | Recruitment | HR Manager and HR officers (`recruitment.manage`): vacancies, publishing, applicant stages, hiring | the same HR staff | Recruitment |
| 13 | Resignation | the employee hands in their own resignation; HR (`separations.manage`) processes clearance and completes it | HR | Separations |
| 14 | Uniforms | HR (`ppe.manage`): entitlements, stock, issues (the employee only acknowledges receipt) | HR | Uniform management |
| 15 | Work tools and equipment | HR (`ppe.manage`), same module (category "tools") | HR | Uniform management |

Retirement, termination and external-transfer separations still need an approved HR case; that case is decided by HR.

## Who is the HR authority
* **HR Manager** role: holds `cases.decide_hr` (decides) and `cases.authorize` (designates officers).
* **HR officers** work on cases (open, submit, review, return, recommend, complete) but do **not** decide automatically. The HR Manager designates a named officer under *HR cases -> Approval rules -> Authorized HR officers*; the **reference of the official designation is required**, the designation is audited, the officer is told by e-mail, and it can be withdrawn at any time. A designation grants only the HR decision permission; disciplinary files additionally need `discipline.manage` (assigned in the roles page).
* Everybody else - executive, line managers, employees, the system administrator and the technical all-rights account - has **no** processing or decision rights on these matters (the all-rights account is excluded on purpose: `HR_ONLY` in `backend/src/mw.js` and `frontend/src/auth.js`). The old permissions `cases.approve` and `discipline.decide` were removed, and the Executive role no longer holds any decision right.

## Rules that keep it safe
* Nobody decides **their own case**; the person who **opened** a case does not decide it; the person who **recommended** it does not decide it (four eyes). A case a person is the subject of is invisible to them for processing.
* Return for correction needs a written reason; a decision needs a written reason and an effective date; a rejection is final.
* The deciding authority of every case type is fixed to HR: the rules screen shows it, `PUT /case-rules/:type` refuses any other authority and refuses to withdraw the confirmation. Only "needs a recommendation" can still be set (system administrator or HR Manager). The other authority options (`cases.approve`, `discipline.decide`) are kept in `approval_authorities` for history but switched off; the add/edit authority routes were removed.
* There is no forward action: an unknown action is refused (400); the detail of a case never offers one.

## Data and migration
* Migration `009_approval_authorities.sql` (tables `approval_authorities`, `authority_delegates`, columns on `hr_cases`) and a one-time step in `backend/src/init.js` (`hr-exclusive-010`): every case-type rule becomes "decided by HR, confirmed" with the institution's clarification as source; the other authorities are switched off; cases forwarded earlier return to HR; the two institution-level decision permissions are removed. Employees, users, roles, other permissions and HR cases are untouched. Backup first: `pg_dump -Fc hrms > before.dump`, then `npm run db:init`.
* The columns `authority_override`, `forwarded_*` on `hr_cases` stay for history but are no longer used.

## Not covered by this clarification (unchanged)
Leave requests (line manager approves), staffing-plan approval (executive) and attendance corrections are not among the 15 matters and keep their current approvers.

## Tests
`npm run test:authority` (79 checks): one authority only; all 11 types decided by HR and confirmed; full case flows (long-term education, short-term training); return for correction; rejection; refusals for executive, line manager, employee, administrator and the technical account; own-case, opener and recommender blocks; named designation (reference required, no self-designation, no double designation, withdrawal works at once); no forwarding; recruitment, resignation, uniforms and work tools open to HR and closed to everybody else. `test:directive` and `test:e2e` exercise every case type end to end with HR deciders.
