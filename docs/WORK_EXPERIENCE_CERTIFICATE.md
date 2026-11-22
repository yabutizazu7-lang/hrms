# Work Experience Certificate (የሥራ ልምድ ማስረጃ)

Menu: **Work Experience Certificate – የሥራ ልምድ ማስረጃ** (HR procedures group). Added inside the existing HR system; no existing module was replaced.

## Workflow
1. An employee asks for a **Recommendation Letter (ምክረ ሐሳብ ደብዳቤ)** – new HR case type `recommendation_letter` in the existing *HR cases* module (self-service request, or HR opens it for the employee).
2. HR reviews it and **gives the recommendation (ምክረ ሐሳብ ስጥ)**. At that moment the Work Experience Certificate is **enabled and its draft is prepared automatically** (language Amharic, data read from the employee database). The HR Manager's approval and completion of the letter afterwards do not block anything. A Work-experience certificate request (`experience_certificate`) enables it the same way, as soon as its recommendation is given. Drafts for recommendations given earlier are prepared when the server starts and when HR opens the employee list.
3. The employee appears as **Ready** (with a draft) in *Employees with a recommendation letter*. Before the recommendation is given, the server refuses to prepare a certificate (HTTP 409). If the employee record is incomplete (e.g. no job title) the recommendation still succeeds and the draft is prepared by hand from the page, with an explanation.
4. HR (officer or manager) opens the draft, or selects the employee and generates one, and can edit the work responsibilities. The certificate is issued in **Amharic only** (Ethiopian calendar dates).
5. The draft is **previewed** (real PDF, without any watermark), can be edited (work responsibilities), refreshed from the database, or discarded.
6. The **HR authority** (permission `cases.decide_hr`: the HR Manager or an officer designated by name) **approves and issues**. The system builds the final PDF, stores it with its SHA-256, saves it in the **employee's personnel file** (Documents, type *certificate*), writes an employee-history note and e-mails the employee.
7. The issued certificate is frozen. The employee can download their own certificate; HR can search, filter, download and print all records.

## What is printed (nothing invented)
Organization logo and name (`org_name`; Amharic name from the new setting `org_name_am`, falls back to `org_name`), title, reference number `WEC-YYYY-NNNNN`, issue date (Ethiopian + Gregorian), employee full name (Amharic / English name when recorded), employee ID, job title (position title, official Amharic title when recorded), department, employment start date, end date (or "still employed"), total service in years / months / days (existing `service.js` rules), employment history (hired / promotion / transfer records of the employee file), work responsibilities, HR manager name and title (the approving user), signature and stamp.
* **Work responsibilities**: the employee record contains no such data, so HR types them on the draft (max 10 lines). If left empty the section is omitted.
* **Signature and stamp**: the HR Manager uploads a PNG/JPEG signature (own, one per user) and the organization stamp (*Signature & stamp* tab, max 1 MB). The system never draws them. If none is uploaded, the PDF shows an empty signature / stamp area for the handwritten signature and the official stamp.
* If the start date is missing/invalid/in the future or the job title is not recorded, preparing the certificate is refused with an explanation.

## Rules enforced by the server
| Rule | Where |
|---|---|
| Only after the HR recommendation has been given on the Recommendation Letter request | `routes/certificates.js` (409) |
| Prepare / edit / preview: `cases.manage` (HR). Issue: `cases.decide_hr`. Super admin, executives, line managers: no access. Nobody prepares or approves their own certificate | route guards |
| One draft and one issued certificate per employee | unique partial indexes (database) |
| Another certificate for an employee who already has one: only the HR authority, with a reason; the old one becomes *superseded* and stays in the history | `reissue` + `reissue_reason` |
| Issued certificate cannot be edited or deleted; history is append-only | triggers in migration 013 |
| Draft must still match the database at issue time (otherwise "Refresh data") | `core()` comparison |
| Employees see only their own **issued** certificate; anything else answers 404 | `mustSee` |
| PDF integrity (SHA-256) checked on every download | `GET /work-certificates/:id/pdf` |

## Database (migration `013_work_experience_certificates.sql`, additive)
`work_certificates`, `work_certificate_events`, `certificate_assets`; the `hr_cases.case_type` check constraint gets one more allowed value (`recommendation_letter`); new rows in `case_approval_rules` and the setting `org_name_am` (empty by default). Run `npm run db:init` (once, in a transaction).

## API
`GET /api/work-certificates/employees` · `GET /api/work-certificates` (`q`, `status`, `from`, `to`, `department_id`, `page`) · `POST /api/work-certificates` · `GET|PUT /api/work-certificates/:id` · `POST …/:id/refresh|issue|cancel` · `GET …/:id/pdf[?download=1|lang=]` · `GET|POST /api/work-certificates/assets`, `DELETE …/assets/:kind`.

## Fonts
PDF uses Noto Sans Ethiopic and Noto Sans (SIL Open Font License) in `backend/assets/fonts`. The logo is read from `frontend/public/kpc-logo.jpg` (override: `CERT_LOGO_PATH`).

## Tests
`npm run test:certificates` (backend, 70 checks: the whole workflow, permissions, duplicates, immutability, integrity) and `node frontend/scripts/smoke-certificates.mjs` (UI in English and Amharic).
