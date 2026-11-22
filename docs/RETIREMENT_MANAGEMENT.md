# Retirement management (ጡረታ)

The existing **Retirement** page (menu *Retirement*, permission `cases.manage` / `cases.view`) now starts with a **Retirement management** dashboard. The existing sections (retirement rule in force, check one employee, retirement forecast, retirement cases) are unchanged below it.

## Rule: age from the date of birth
* The retirement age is the setting `retirement_age_years` (60; shown and editable in *Retirement rule in force*).
* **Age = whole years between `employees.date_of_birth` and today** (date in the organisation time zone, default Africa/Addis_Ababa). It is calculated on every request, never typed in and never stored. The hire date plays no part.
* A 29 February birthday counts from 1 March in years without a 29 February.

| Status | Rule |
|---|---|
| Active employee | younger than 59 |
| Approaching retirement | exactly 59 (retirement age - 1) |
| Eligible for retirement | 60 or older, retirement not completed |
| Retirement process completed | the retirement case is completed (the existing separation was opened), or a retirement separation exists |

Employees without a date of birth cannot be checked; the page shows how many there are.

## Dashboard
Full name, employee ID, gender, date of birth, current age, department, job position, employment start date, retirement eligibility date (date of birth + 60 years), status; official retirement date once approved. Search (name or ID), department filter, status filter (default: approaching + eligible), sort by name / age / department / retirement date, statistic tiles (active, approaching, eligible, completed, needs attention, processes in progress). The HR dashboard shows the same counts and a **Retirement alerts** list; the menu item shows a badge.

## Notifications (HR Manager)
A check runs 7 seconds after start and every 6 hours (and on demand: `POST /api/retirement/check`, HR authority). Each employee gets **one** `approaching` and **one** `eligible` record in `retirement_milestones` (unique key). Newly raised records are claimed once (`notified_at`) and sent as **one e-mail digest per milestone** to every active user whose role holds `cases.decide_hr` (English + Amharic). A second run sends nothing. Employees who are already 60 or older when the feature is first installed are reported once, as "eligible".

## Processing
1. **Initiate retirement processing** (HR, `cases.manage`; only for *eligible* employees): creates the existing HR case type `retirement` with the basis, the eligibility date and optional remarks. One open case per employee (checked by the server and by a unique database index).
2. The case follows the existing workflow, opened from the employee's details: HR submits, reviews and recommends; the **HR Manager** (`cases.decide_hr`) approves, records the **official retirement date** (the effective date) and the decision reason, then completes it, which opens the existing separation. Nobody approves a case they started or recommended (existing four-eyes rule). A *Remarks* field was added to the retirement case.
3. **Retirement letter (PDF)**: after approval (official date recorded) HR generates it once per case (Amharic only). Saved in the employee's documents, noted in the employee history, immutable, SHA-256 checked on every download. The retiring employee can download it after completion. The HR Manager's signature image and the organisation stamp (uploaded under *Work Experience Certificate > Signature & stamp*) are placed on it; otherwise the areas stay empty.
4. The profile (Overview) shows a **Retirement** card; history = case events, notification records, letter, documents.

## Database (migration `014_retirement_management.sql`, additive)
`retirement_milestones`, `retirement_letters`; unique partial indexes on `hr_cases` (one open and one completed retirement case per employee; created only if existing data has no duplicates). No row is deleted or rewritten.

## API
`GET /api/retirement/overview` (`q, department_id, status, sort, dir, page`) · `GET /api/retirement/employees/:id` · `POST /api/retirement/employees/:id/initiate` · `POST /api/retirement/employees/:id/letter` · `GET /api/retirement/letters/:id/pdf[?download=1]` · `POST /api/retirement/check`. Existing endpoints (`/retirement/forecast`, assessment, settings, `/hr-cases`) are unchanged.

## Tests
`npm run test:retirement` (62 checks) and `node frontend/scripts/smoke-retirement.mjs`.
