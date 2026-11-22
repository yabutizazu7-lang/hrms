# API reference (all under `/api`, JSON; `Authorization: Bearer <token>` except public routes)
Errors: `{ "error": "message" }` — 400 validation/state · 401 not signed in · 403 no permission · 404 not found (also used for records the user may not see) · 409 conflict · 423 locked · 429 rate limit.
"Self" = the signed-in employee; no permission needed.

## Auth / public
`POST /login` · `GET /me` · `POST /change-password` · `POST /forgot` · `POST /reset` · `GET /public/vacancies[/:id]` · `POST /public/apply` · `GET /public/applications/:code`

## Employees and organization
`GET·POST /employees` (hr.view_all / team.view / self; employees.manage) · `GET·PUT /employees/:id` · `PUT /me/profile` (self) · `POST /employees/:id/account` (accounts.manage) · `GET·POST /employees/:id/documents` · `GET /documents/:id/download` · `POST /documents/:id/verify`
`GET·POST·PUT /departments`, `/positions` (org.manage) · `GET /directory` (any signed-in employee) · `GET /lookups`

## Leave and attendance
`GET /leave-types` · `GET /leave/balances` · `GET /leave/requests` · `POST /leave/requests` · `POST /leave/requests/:id/decide·cancel` · `POST /leave/adjustments` (leave.manage) · `GET /leave/calendar` · `GET·POST·DELETE /holidays` (config.manage)
`GET /attendance/today` · `POST /attendance/clock` · `GET /attendance` · `POST /attendance/manual` · `GET·POST /attendance/corrections` · `POST /attendance/corrections/:id/decide` · `GET /attendance/summary?month=`

## Permanent employment (after probation)
`GET /permanent-employment` (filters: view, department_id, q, from, to) · `GET /permanent-employment/summary` · `POST /permanent-employment/check` · `POST /employees/:id/permanent/confirm` · `POST /employees/:id/permanent/decline` · `GET /employees/:id` returns a `probation` block · `GET /employees` also filters by `hired_from`, `hired_to`, `probation_status`

## Recruitment, performance, people
`GET·POST·PUT /vacancies`, `POST /vacancies/:id/publish·close` · `GET /applicants`, `GET /applicants/:id[/cv]`, `POST /applicants/:id/stage·note·hire`
`GET·POST·PUT /appraisal-criteria` · `GET·POST /appraisal-cycles`, `POST …/start·close` · `GET /appraisals[/:id]`, `PUT /appraisals/:id/self·manager`, `POST /appraisals/:id/finalize`
`GET·POST·PUT /trainings` · `GET·POST·DELETE /announcements` · `GET /separations[/:id·/mine]`, `POST /separations`, `POST /separations/resign`, `POST /separations/:id/clear/:itemId·complete·cancel`

## Reports, administration
`GET /dashboard` · `GET /reports`, `GET /reports/:name` · `/users` (+`/reset-password`, `/unlock`) · `/rbac`, `PUT /roles/:code/permissions` · `GET·PUT /settings` · `GET·PUT /tax-brackets` · `GET /audit` · `GET /notifications`


## Work Experience Certificate
See `docs/WORK_EXPERIENCE_CERTIFICATE.md` (section API).
