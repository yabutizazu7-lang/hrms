# HRMS Implementation Audit — Kombolcha Polytechnic College

Last updated: 23 October 2026. Companion document: `HRMS_OFFICIAL_RULES_REGISTER.md`.

## 1. Existing architecture (inspected before any change)

| Layer | What exists |
|---|---|
| Frontend | React 18 + Vite, `react-router`, `react-i18next` (English / Amharic, natural-language keys, `npm run i18n:check`), Ethiopian-calendar helper (`ethDate.js`), print helper |
| Backend | Node.js + Express (CommonJS), `pg` (PostgreSQL), JWT login, bcrypt, role-based permission middleware (`perm()`, `has()`), audit log, e-mail queue, file storage with SHA-256 + magic-byte checks |
| Database | PostgreSQL. `db/schema.sql` is idempotent and run by `npm run db:init`. Existing employee ID is `employees.employee_no` (`EMP-00001`, unique) |
| Tests | `backend/test/e2e.js` — 259 checks at the start |
| Existing modules | Employees (+history, documents), organization, leave (types, balances, requests, calendar), attendance, recruitment (+public careers page), performance appraisals, separations/clearance, training, announcements, reports, users/roles/permissions, audit trail, e-mail log |
| Roles (8) | super_admin, admin, hr_manager, hr_officer, executive, manager, employee |

Baseline before changes: **259 passed, 0 failed** (fresh PostgreSQL, demo data).

## 2. The eleven modules — status

Legend: **Done** = frontend + backend + database + permissions + automated tests. **Partial** = works, with listed gaps. The new screens were built, compiled and **rendered in a simulated browser (jsdom) against the running API** in English and Amharic (list and detail views, no React errors, no missing translations). They have **not been clicked through in a real browser**, so layout and styling are unchecked.

| # | Module | Status | Where | Gaps |
|---|---|---|---|---|
| 1 | Recruitment, probation, permanent appointment, promotion, acting, transfer | **Partial** | Dedicated **Permanent employment** screen (probationers with days left, start appointment case, appointment cases); existing Recruitment module kept; new HR cases: permanent appointment, promotion, acting/temporary assignment (incl. Dean / coordinator kinds), internal transfer; staff positions with vacancy view; decision history; generic official letter | Recruitment vacancies are **not linked** to staff-position numbers; letters use one generic layout (not a separate approved template per letter type); no acting-assignment end-date automation |
| 2 | Recruitment, promotion, internal and external transfer | **Partial** | External transfer in/out as a case; *out* opens a separation with clearance; *in* records earlier service as unverified; duplicate occupancy blocked by a database trigger | Releasing/receiving institution details are free text + letter references; eligibility rules require governing text (not supplied) |
| 3 | Work experience and service history | **Done** | `service_periods`, overlap-safe duration, two-person verification, verified periods are permanent, experience certificate from an approved case using **verified service only** | Linking a supporting document to a period has a database column but no screen |
| 4 | Resignation and clearance | **Existing, kept** | Existing separation workflow (resignation, clearance tasks, deactivation after clearance) | Not re-audited beyond regression tests; transfer-out added as a kind |
| 5 | Termination | **Done** | HR case: ground, legal reference, notice, employee response (or waiver), recommendation, separate decision-maker, appeal, then clearance. **Direct termination/dismissal/retirement through the plain separation form is now refused** | Grounds and notice periods are not built in (rules not supplied) |
| 6 | Retirement | **Partial** | Dedicated **Retirement** screen (menu: *HR procedures → Retirement*): per-employee eligibility check, forecast list from the configured age, start-case button, retirement cases; HR case; eligibility assessment driven by blank-by-default settings; pension-document status and referral reference fields | Pension amounts never computed; retirement age is **60 on the HRMS owner's instruction** (source field says the legal reference is not yet recorded); minimum service not set |
| 7 | Disciplinary | **Done** (workflow) | Confidential case, notification + response + findings required before recommendation, decision by `discipline.decide`, sanction only from an HR-defined list, appeal; hidden from the accused, from other HR users, and from general history | Sanction list is empty until HR enters sanctions with sources; the employee's response is recorded by HR (no employee portal for it); investigator field is not enforced |
| 8 | Annual leave | **Existing, extended** | Existing requests, balances, overlap prevention, approval, cancellation, calendar; **added return-to-work record** | Entitlement/carry-forward rules are as configured before; not verified against a supplied document |
| 9 | Uniforms and work equipment | **Partial** (catalogue and Annex 3 loaded, unverified) | Screen renamed **Uniform management**; added *Eligible employees* list (CSV export) and *Import annex* (paste the directive table; all-or-nothing, rows start unverified, verified rows never overwritten); items, entitlements (HR-entered with source), stock ledger, issue with waiting period + yearly cap + stock check, replacement with reason, acknowledgment by the recipient only, returns, department distribution, CSV | Annex 3 quantities **loaded unverified** from pages 24–27 (illegible parts of page 27 not loaded); Tahsas-30 deadline, acting-staff rule, cash tailoring allowance, price ceilings, purchase committee not modelled (see register B) |
| 10 | Training and education | **Partial** | Short-term training and long-term education as cases (needs, institution, dates, documents, approval); approved cases create the training record; follow-up notes | No budget tracking, attendance register, certificate/evaluation forms or academic-progress structure beyond notes/documents |
| 11 | Continuous annual HR plan | **Done** | Plan → review → approved (by someone other than the author) → implementing (progress per month/quarter with challenges and corrective actions) → year-end evaluation; achievement computed from progress | No evidence-file upload (text reference only) |

### Work clothing and equipment catalogue (added on request)
Directive 173/2018, **PDF pages 4–27 only**, read from the page images. Loaded into the existing Uniform management tables (no duplicate structures): **82 items** (Annex 1: 43; Annex 2: 14 not already in Annex 1; Annex 3-only wording: 9; Articles 2/5: 7; Art. 2(4) equipment: 9) with Amharic names as printed, English translations, kind, **category** (new, 8 categories), unit and source reference; **480 entitlement rows** from Annex 3 groups 1–11 (positions, quantity per year or per 24/36 months, first-year allowances, applicability) loaded **unverified**. Migration `003_ppe_catalog.sql` (additive columns) + `seed-ppe.js` (idempotent, never overwrites). The Items, Issue and Entitlements tabs follow your screenshot and add category, search, a manual item picker and period/first-year display; issuing now honours rolling periods, first-year quantities and per-entitlement immediate eligibility. Not loaded because illegible in the scan: part of group 10's positions and group 11's position title (page 27). Full list, interpretations and limitations: `docs/PPE_CATALOG_DIRECTIVE_173_2018.md`.

### Public front page and sign-in (added on request)
Visitors who are not signed in now see a professional front page at `/` (`frontend/src/pages/Home.jsx`): College logo and name, hero, what the system covers, self-service for employees, security and confidentiality, a careers call-to-action, language switch (English / አማርኛ), responsive down to phone width. The sign-in page is now a two-panel page with the College brand. `index.html` has the College title, description, theme colour and logo icon. Signed-in users are unaffected (they still land on their dashboard). Checked by rendering in a real headless Chromium (desktop, phone, Amharic) and by the render test. The page makes no claims beyond what the system does.

### Audit trail for HR (added on request)
New permission **`audit.view_hr`**, granted to the **HR Manager** role (one-time, additive grant, also applied to existing databases on upgrade). It opens the same Audit trail screen (periods, search, summary, CSV) **limited to HR records**: employees and their documents, HR cases, separations, recruitment, appraisals, service history, leave, attendance, uniforms, training, staff positions, departments, HR plans, announcements and holidays. It does **not** show accounts, roles, settings, payroll, loans or sign-in events, and it hides entries about **disciplinary cases** from anyone without `discipline.manage` / `discipline.decide`. The scope is applied in the database query, so the summary and the CSV export are limited too, and the screen says so. HR Officers and employees have no audit access; an administrator can grant `audit.view_hr` (or the full `audit.view`) to any role in the role editor. The full `audit.view` (administrators) is unchanged.
Reasoning: the full trail contains everyone's activity, including administrator actions; HR needs oversight of HR records, not of the whole system.

### Audit trail periods (added on request)
*Administration → Audit trail* now filters by **2 weeks, 1 month, 3 months, 6 months, 9 months, 1 year** or all time (default 1 month), combined with the search box. It pages 100 entries at a time so a full year is never cut off at 500, shows a summary (entries, users, first/last entry, most frequent actions, most active users) and exports the chosen period to CSV (up to 50,000 rows; cells starting with `= + - @` are neutralised; the export itself is audited). Needs the `audit.view` permission. Periods are fixed server-side values, so nothing from the request reaches the SQL. Entries remain impossible to edit or delete (checked by a test). Month periods are calendar months counted back from now. API: `GET /audit?period=2w|1m|3m|6m|9m|1y|all`, `/audit/summary`, `/audit/export`.

## 3. Identifiers (Part 5)

| Identifier | Where | Rules enforced |
|---|---|---|
| Internal Employee ID | `employees.employee_no` (unchanged, unique) | read-only |
| Permanent staff position number (ቋሚ የሰራተኛ መደብ ቁጥር) | `staff_positions.position_no` (TEXT) assigned via `employees.staff_position_id` | stored exactly as typed (leading zeros, letters); unique; capacity 1 unless an authorizing decision is cited; occupancy enforced by a **database trigger**; never derived from another number |
| Fayda number | `employees.fayda_fan` (separate) + `fayda_status` | digits only; not 16 digits or repeated ⇒ *pending verification* + flag; masked (`•••• •••• •••• 1234`) in every ordinary response, including the employee's own; full value only via `GET /employees/:id/fayda` for `fayda.view`, **audited**; value is never written to audit or history |
| National ID, pension number, TIN | existing fields, untouched | – |

An employee can see their own position number, cannot change any identifier, and cannot see another employee's.

## 4. Database changes (`backend/db/migrations/002_directive_modules.sql`)

Additive only: no `DROP TABLE`, `TRUNCATE` or `DELETE` (asserted by a test). New tables: `staff_positions`, `hr_cases`, `hr_case_events` (append-only), `hr_case_documents`, `discipline_sanctions`, `case_approval_rules`, `service_periods`, `ppe_items`, `ppe_entitlements`, `ppe_stock_moves`, `ppe_issues`, `hr_plans`, `hr_plan_items`, `hr_plan_progress`, `import_batches`, `import_rows`, `verification_flags`, `schema_migrations`. New employee columns: `fayda_fan`, `fayda_status`, `staff_position_id`, `identifiers_verified`. Leave: `return_to_work_on`, `cancelled_at`. The one existing constraint touched is `separations_kind_check` (adds `transfer_out`). Finished cases cannot be altered or deleted and events cannot be edited (triggers).
`init.js` applies each migration once, inside a transaction, and records it. New permissions are **added** to existing roles once (never removed); administrators' role edits are preserved.

New permissions: `audit.view_hr`, `fayda.view`, `positions.manage`, `cases.view`, `cases.manage`, `cases.approve`, `discipline.manage`, `discipline.decide`, `service.manage`, `ppe.manage`, `plans.manage`, `plans.approve`, `import.manage`.
Defaults: hr_manager — everything except approve/decide; hr_officer — everything except Fayda, discipline, approval; executive — approve/decide/plan approval; employees — only their own requests.

## 5. Workflow control

One engine (`routes/cases.js`, `workflows.js`): draft → submitted → under review → (returned) → recommended → approved/rejected → completed (+ appeal for termination and discipline). Enforced on the server: required fields and documents, stage order, **no self-approval, and the person who opened a case does not decide it**, approval authority from `case_approval_rules`, confidentiality, frozen completed cases, complete event history. Completing a case applies the decision to the employee record in one transaction (position/department/type changes, history entry, or opening a separation). A permanent appointment cannot be approved without a *satisfactory* probation evaluation.

## 6. Register reconciliation (Part 6)

`node src/import-register.js --file <xlsx>` previews (read-only transaction); `--apply` inserts new employees and fills only **empty** fields of matched ones (match: Fayda → pension number → exact name, only when unique); records every row in `import_rows`; `--rollback <batch>` removes inserted employees that have no other records and restores filled fields still unchanged. Identical repeated rows are skipped. Result on the supplied register (scratch database): preview 202 insert / 0 update / 0 skip / 3 fail; apply wrote 202; re-apply inserted 0 and skipped 202; rollback removed 201 and **kept 1** that had acquired a leave request; re-import restored 201.
**Your real database was not available to me.** Run the preview against it first.

## 7. Risks and safe migration strategy

1. Back up first (`docs/BACKUP_AND_RECOVERY.md`), run `npm run db:init`, then the tests on a *copy*.
2. Behaviour change: termination, dismissal, retirement and transfer-out can no longer be started from the plain separation form (setting `termination_requires_case`, default `true`; the one affected legacy test was updated).
3. Approval authority defaults are placeholders until HR verifies them.
4. **Security finding:** the supplied archive contained `backend/.env` and a `.env.example` holding what look like real database and e-mail credentials. Rotate them if the archive was shared, and keep only placeholders in `.env.example`. I did not modify either file.
5. Fayda numbers are personal identity data. Confirm the lawful basis and retention before importing them; they are imported as *pending verification*, not verified.
6. The sandbox could not reach your production database, your SMTP server or a browser.

## 8. Tests actually run (fresh PostgreSQL, demo data)

| Suite | Command | Result |
|---|---|---|
| Existing regression | `npm run test:e2e` | **260 passed, 0 failed** (259 original + 1 new assertion; the termination test now runs through the authorized case) |
| Directive modules (identifiers, workflow, confidentiality, service, uniforms, plan, permissions, leave return) | `npm run test:directive` | **205 passed, 0 failed** |
| Work clothing / equipment catalogue (completeness, duplicates, rules, issuing, safe loading) | `npm run test:ppe` | **48 passed, 0 failed** |
| Register import | `npm run test:import` | **12 passed, 0 failed** |
| Migration safety (original schema + data → upgrade, twice; retirement age 60 applied once, later HR changes kept) | `npm run test:migration` | **18 passed, 0 failed** |
| Frontend build | `npx vite build` | built |
| Translation completeness | `npm run i18n:check` / `npm run i18n:check-directive` | OK (1,372 keys; 59 server messages) |
| UI smoke render (jsdom, live API, English + Amharic) | `API=http://127.0.0.1:PORT USERS="hrm:pw,emp:pw" npm run test:ui` (frontend) | **63 passed, 0 failed**; it caught 9 untranslated tab labels and 2 untranslated role labels, now fixed |

Not tested: any screen in a real browser (layout, styling, print output); e-mail delivery; real data; concurrency beyond the advisory lock on uniform issues; Windows-specific behaviour.
