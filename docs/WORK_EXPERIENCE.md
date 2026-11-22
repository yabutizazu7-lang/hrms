# Automatic work experience

Work experience is **derived, never typed or stored**. The server calculates it from the recorded dates every time it is asked, as of the current date, so it changes by itself as time passes. One function does all of it: `backend/src/service.js` -> `experience()`. The employee profile, the Service history tab, the employee lists, the retirement checks, the reports and the exports all call it, so every screen shows the same figure.

## What is shown
| Figure | Meaning |
|---|---|
| Employment start date | `employees.hire_date` |
| **Current service duration** | start date up to and including today (or the termination date), in years, months, days. Service at this institution only |
| **Previous verified work experience** | verified previous employment (table `service_periods`, several records per employee), overlaps removed |
| **Total verified work experience** | previous verified + current, in years, months, days |
| Claimed total | the same including unverified records (shown only on the Service history tab, never used for rules) |
| Register figures | the "service at another institution / at this institution / total" texts from the register are shown as *reported in the register (not verified)*. They have no dates, so they are never counted |

Previous employment records (organization, job title, grade, dates, interruption note, verification) already existed (migration `002_directive_modules.sql`, table `service_periods`), so **no new table and no new migration were needed**. Nothing in `employees` was changed or added.

## How it is calculated
* **Days.** A period counts its first and its last day (1 Jan..31 Dec = 1 year, 0 months, 0 days). Current employment runs from the start date through today.
* **One period** is measured on the calendar: whole months from the start date, then the remaining days. A start day that does not exist in a month completes that month at its end: 31 Jan -> 29 Feb (2024) is 1 month, 31 Jan -> 28 Feb (2023) is 1 month, 29 Feb 2020 -> 28 Feb 2021 is 1 year. (The old calculation could return negative days for month-end starts; this is fixed.)
* **Adding parts** (previous + current): days carry into months at 30 days, months into years at 12 (the 30-day month of the Ethiopian calendar). So total = previous + current exactly as displayed.
* **Overlaps are counted once.** Overlapping previous periods are merged; a previous period that overlaps the current employment contributes only the days before it. The same period entered twice counts once. Overlaps are reported as a warning.
* **Only verified previous periods count.** A period is verified by a second HR user (the person who entered it cannot verify it). Unverified ones appear in the claimed figure only.
* If HR recorded interruptions at the current employer (periods flagged "current institution"), the verified ones replace the plain start-date range (as before).

## Validation and warnings
* Previous period: end date not before start date (database check and API), start and end not in the future, the same period cannot be entered twice, an overlap is accepted but the response warns.
* Warnings on the profile, the Service history tab and the lists (a warning sign): start date missing, not a real date (for example 30 Feb), in the future; end of employment before the start date; a previous period that ends before it starts, ends in the future, or overlaps another period or the current employment. No experience is invented: with a missing or invalid start date the current service is shown as "-".

## Where to find it
* **Employee profile:** section *Work experience* (start date, current service, previous verified, total verified, unverified count, previous employers with job title and verification, warnings). Visible to HR and to the employee themselves; not to line managers.
* **Employees list (HR):** columns *Current service duration* and *Total verified work experience*; filters *Experience from / up to (years)* (on the total verified experience); *Sort by* total verified experience or service at this institution, longest or shortest first; register view; **Export CSV** (translated headings and durations in the selected language).
* **Reports:** new report *Work experience* (numeric years / months / days columns for current, previous verified and total verified, unverified count, warnings; ordered by total verified experience; HR only; CSV and Print/PDF as for every report). The *Years of service* report now uses the same calculation.
* **Service history tab:** start date, current, previous verified, total verified, claimed.
API: `GET /employees/:id` (`experience`), `GET /employees` (`experience`, `experience_min_years`, `experience_max_years`, `sort=experience|experience_asc|service|service_asc`), `GET /employees/:id/service`, `GET /reports/work_experience`.

## Tests
`npm run test:experience` (72 checks): less than a year, many years, "5 years, 7 months, 12 days", the figure moving with the date, leap years and month ends (including 4 000 consecutive days of a 31 January start and a day-count cross-check), several previous records, unverified records, overlapping periods (previous/previous, previous/current, duplicate, contained, adjacent), missing / invalid / future / reversed dates, the API (profile, verification rules, validation, permissions), list columns, filters and sorting, report figures equal to profile figures. The UI smoke test checks the section in English and Amharic.

## Manual steps
None for the database. Deploy the new code and restart the backend. Existing employee data is untouched.
