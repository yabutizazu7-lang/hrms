# Human Resource Management System (HRMS)

A complete, role-based HR system built on the **same stack and visual design** as the Departure Point, Police and Court systems
(React + Vite · Node.js/Express · PostgreSQL · role-colour themes · English / Amharic with Ethiopian-calendar date · e-mail queue · SVG charts · RBAC permission matrix).
Ports differ from the other systems (API **28200**, website **5180**) so all of them can run side by side.

## What it does

| Module | Purpose |
|---|---|
| **Self-service** | Every employee: own profile and contact details, **clock in / out**, leave balances and requests, appraisal, training, resignation, staff directory, org chart, announcements |
| **Employees** | Master record (Ethiopian three-part names, ID, TIN, pension no., bank), department / position / reporting line, employment type (permanent, contract, probation, intern, part-time), contract and probation end dates, **permanent employment history** (hire, promotion, transfer, salary and manager changes), personnel documents with SHA-256 integrity check |
| **Organization** | Departments (hierarchy, heads), positions with **salary ranges** (enforced), org chart |
| **Leave** | Leave types and rules (annual 16 days + 1 per 2 years of service, first-year pro-rating, sick leave with certificate, maternity / paternity by sex, unpaid, notice periods), working-day arithmetic that skips weekends and public holidays, overlap and balance checks, **approval by the direct manager**, HR balance adjustments, "who is away" calendar |
| **Attendance** | Clock in/out with timezone-aware **late detection**, correction requests approved by the manager/HR, manual entry, monthly summary (present / late / leave / absent) |
| **Permanent employment** | Probation period of **6 months (configurable)** calculated from the employment start date; HR is notified once when it is completed; an authorized HR officer **confirms permanent employment** or records a decision (reason, next action); full history; dashboard numbers; filters by department, type, start date and status. See `docs/PAYROLL_REMOVAL_AND_PERMANENT_EMPLOYMENT.md` |
| **Employee register** | The 27 columns of the Excel register (ተ.ቁ, FAN, Amharic and English names, institution, education, service durations, children, JEG title, grade, salary, flags, disability, training, employment type) as employee fields; register view in ተ.ቁ order; filters; **Employee register import** screen (preview, apply, error report, undo). See `docs/REGISTER_FIELD_MAPPING.md` |
| **Work experience** | Automatic current service (years, months, days) from the employment start date, previous **verified** employment (several records, overlaps counted once) and total verified experience - derived from dates, never stored. On the profile, in lists (filters, sorting, CSV), in the *Work experience* report. See `docs/WORK_EXPERIENCE.md` |
| **Work Experience Certificate** | Recommendation Letter issued -> certificate enabled -> HR drafts, previews, the HR Manager approves and issues a real PDF (Amharic / English), saved in the employee file; records, search, history, no duplicates. See `docs/WORK_EXPERIENCE_CERTIFICATE.md` |
| **Retirement management** | Age (from the date of birth) decides: active / approaching (59) / eligible (60+) / completed; dashboard with search, filters, sorting, statistics; HR Manager notified once per milestone; process, approval with official date, retirement letter PDF. See `docs/RETIREMENT_MANAGEMENT.md` |
| **Probationary -> permanent** | all current staff permanent; new hires only "Probationary (Trial Period)" and automatically permanent after six months (setting `probation_auto_permanent`). See `docs/PROBATION_AUTO_PERMANENT.md` |
| **HR exclusive authority** | The HR department alone processes and decides all HR cases (11 case types), recruitment, resignation, uniforms and work tools. HR Manager decides; other HR officers only when designated by name; four-eyes control; nobody decides their own case; no forwarding and no executive/department-head approval. See `docs/APPROVAL_AUTHORITIES.md` |
| **Uniform and work-tool entitlements by job title** | Directive 173/2018 entitlements follow each employee's job title: automatic matching of the college titles to the directive's occupations, HR review of the rest, issuing with authorized-quantity control and documented exceptions. See `docs/PPE_ENTITLEMENT_MAPPING.md` |
| **Recruitment** | Vacancies → public careers page → online application with CV upload → pipeline (applied → screening → interview → offer → hired) with ratings and notes → **one-click hire** into an employee record (CV copied to the personnel file) |
| **Performance** | Appraisal cycles with weighted criteria; self-assessment → manager scoring → HR finalization; the employee **cannot see manager scores until completion**; completed appraisals are frozen |
| **Separations** | Resignation (with notice period), termination, end of contract; **clearance checklist**; completion deactivates the account and cancels future leave |
| **Training, announcements** | Training records and costs; company announcements |
| **Reports** | 8 reports: workforce by department, workforce profile, turnover, leave utilization, lateness, years of service, recruitment funnel, **expiring contracts / probation / documents**. Print/PDF and CSV |
| **Administration** | Users, roles & permissions matrix, departments & positions, leave types & holidays, system settings (incl. the probation period), audit trail, e-mail log |

### Rules enforced by the server (not only the screen)
- A reporting line can never loop (a CEO cannot report to a junior); nobody is their own manager.
- Salary must lie within the **range of the position**; setting a salary needs `salary.manage` (HR officers can register people without seeing or setting pay).
- Leave: no overlap, enough balance, notice period, certificate where required, **nobody approves their own request**; only the direct manager or HR decides.
- A separation cannot be completed before the last working day, with open clearance items, with unpaid loans, or while the employee still has direct reports.
- Finalized appraisals, employment history, leave adjustments and the audit trail are permanent.

## Security design
- **Separation of duties**: only `super_admin` bypasses permission checks. The system `admin` manages accounts and configuration but **cannot see employee records**. HR officers see ID numbers but not salaries; managers see only their reporting line, without salary, ID, bank or date of birth.
- **Need-to-know visibility**: an employee sees only themselves; a manager their downline; HR everyone. Anything not visible answers *404* (existence is not revealed).
- Permissions and the active flag are **re-read from the database on every request**; a leaver's account stops working immediately.
- Passwords: bcrypt, 10+ characters with letters and numbers, lock-out after 5 wrong attempts, forced change of temporary passwords, single-use hashed reset links.
- File uploads: type allow-list **plus magic-byte check**, size limit, random names outside the web root, permission-checked downloads (`nosniff`, `attachment`, `no-store`), SHA-256 verified on every download. CVs accept PDF/Word only.
- Public endpoints (careers) are rate-limited, honeypot-protected and reveal only a simplified status; bank CSV cells are protected against spreadsheet formula injection.
- Audit trail records sign-ins, views of employee/appraisal records, downloads, permanent-employment decisions and every change.

## Quick start
```bash
createdb hrms
cd backend
cp .env.example .env        # set DB_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD   (Windows: copy .env.example .env)
                            # JWT_SECRET is generated and saved automatically on first start (development)
npm install
npm run db:init             # creates / upgrades tables, roles, permissions, default settings, tax brackets, leave types
npm run seed:admin          # first Super Admin
npm run seed:demo           # OPTIONAL: fictional company, 16 employees, leave, attendance (never in production)
npm run dev                 # API on :28200

cd ../frontend
npm install
npm run dev                 # http://localhost:5180  (proxies /api to :28200)
```
Demo logins (after `seed:demo`; password = `SEED_PASSWORD`, default `Dev@12345678`), all `@hrms.test`:
`hrm` (HR manager) · `hro` (HR officer) · `payroll` (a finance employee) · `exec` (executive) · `mgr`, `sup`, `fin`, `itm`, `sales` (line managers) · `emp`, `emp2`, `dev`, `acc`, `intern`, `sale1`, `sale2` (employees) · `admin` · `superadmin`.

To replace the demo accounts with the real staff accounts: set `STAFF_*_EMAIL` in `.env`, run `npm run db:init`, then `npm run users:replace-demo` (dry run) and `npm run users:replace-demo -- --apply`. Only `@hrms.test` users are removed.

### Production
```bash
cd frontend && npm run build
cd ../backend && NODE_ENV=production npm start     # the API also serves the website
```
HTTPS (nginx/Caddy), `JWT_SECRET` (32+ random chars, **not** auto-generated in production), `CORS_ORIGIN`, `PUBLIC_URL`, `TRUST_PROXY=1`. **Back up the PostgreSQL database and the `UPLOAD_DIR` folder together.** Do not run `seed:demo`.

### Troubleshooting
`database "hrms" does not exist` → `createdb hrms`. · `password authentication failed` → fix `DB_USER`/`DB_PASSWORD`. · Port in use → change `PORT` in `.env` and the proxy in `frontend/vite.config.js`.

### Tests
`cd backend && npm run test:e2e` – **the checks** of the real API: masking and visibility per role, employee validation, leave rules, attendance, recruitment → hire, appraisal workflow, separation and clearance, reports, settings validation, audit immutability. Repeatable; **development database only**.
`cd frontend && npm run i18n:check` – fails when any English/Amharic text is missing.

## Must be confirmed before go-live (configuration, not code)
- **Leave rules** (16 days + 1 per 2 years, sick 30 days, maternity 90, paternity 3 …), **notice period** (30 days), working hours, weekend days and grace period: all editable under *Leave types & Holidays* and *System settings*. Have them checked against your labour law and company policy.
- **Public holidays**: only the fixed-date holidays are seeded for the demo; add movable ones (Easter, Eid) every year.
- **Data protection**: this system holds sensitive personal and salary data. Review who receives `salary.view`, `employees.sensitive`, `documents.view_all` and `audit.view`, retention of former-employee records, and backup encryption.
- E-mail: set `GMAIL_USER` / `GMAIL_APP_PASSWORD`; without them mails appear as "simulated" in the E-mail Log.
- Not included: biometric / device attendance integration, bank API payments (a transfer file is exported instead), overtime auto-calculation, pension/tax authority e-filing, shift rosters.

See `docs/API.md` for the endpoints.

## Directive-based HR modules (added)
HR cases (appointment, promotion, acting, transfers, termination, retirement, discipline, education/training), staff-position numbers and Fayda numbers, service history, uniforms and equipment, annual HR plan, register reconciliation. See `HRMS_IMPLEMENTATION_AUDIT.md`, `HRMS_OFFICIAL_RULES_REGISTER.md` and `docs/BACKUP_AND_RECOVERY.md`.
Tests: `cd backend && npm test`. Register preview: `node src/import-register.js --file "<register.xlsx>"`.
