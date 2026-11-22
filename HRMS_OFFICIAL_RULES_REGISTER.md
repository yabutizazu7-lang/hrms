# HRMS Official Rules Register — Kombolcha Polytechnic College

**Purpose.** Every rule the system relies on, where it came from, and whether it is verified. A document that was *supplied* is not the same as a law that is *verified as currently in force*. Nothing below is claimed to be current without evidence, and the system never contains a rule that is not listed here.

**Verification status values**
- **Supplied – OCR-read**: found in a supplied document. The directive is a scanned image (46 pages); text was read with Amharic OCR, which is imperfect. An HR officer must compare the wording with the original page before relying on it.
- **Supplied – internal**: found in a College document (job description).
- **Configuration required**: no governing text was supplied. The system has *no built-in value*; an authorized HR user must enter it with its source.
- **Not modelled**: stated in the document but not (yet) enforced by the system.

## A. Documents supplied (`3. Human Resource.zip`)

| # | Document | What it is | Status |
|---|---|---|---|
| D1 | Directive No. 173/2018 E.C. (scanned PDF, 46 pages, Amharic) | Amhara National Regional State – Revised Directive on the issuance and use of work clothing and work equipment for government employees | Supplied – OCR-read |
| D2 | Employee register Excel, "205 Final A REPORT Nehase 2018" | Staff register, 205 rows, 27 columns | Data source (see C) |
| D3 | Job description – HR Management Team Leader (KPC-OF-HR-018) | College form | Supplied – internal |
| D4 | Job description – HR Management Expert II (KPC-OF-HR-018) | College form | Supplied – internal |
| D5 | Job description – Foot Messenger (KPC-OF-HR-018) | College form | Supplied – internal (no HR rule) |
| D6 | Job description – Secretary (KPC-OF-HR-018) | College form | Supplied – internal (confidential handling duty only) |
| D7 | College logo (`logo.jpg`) | Used on official letters (`/kpc-logo.jpg`) | – |

**Not supplied, but required by modules 1–8:** the civil-service proclamation that governs employment (Directive 173/2018 itself cites *Revised Amhara Regional Civil Servants Proclamation No. 309/2018 E.C.*, Art. 74(4) and Art. 148(2)), its regulations, the leave, retirement/pension, discipline, termination, promotion, transfer and training rules. See section D.

## B. Directive No. 173/2018 E.C. — rules identified

Source: D1. Reference: *Directive No. 173/2018 E.C.* Issued by the Amhara Region Civil Service and Human Resource Development Bureau under Proclamation 309/2018 (Art. 74(4), Art. 148(2)). Approved by the Regional Administration Council on Sene 16, 2018 E.C. (6th round, 5th year, 11th regular meeting); stated to apply **from Hamle 1, 2018 E.C.** Transmittal letters dated 14/11/2018 and 22/12/2018 E.C.
**Applicability to the College** (a public institution in Amhara Region): the directive says it covers government offices under the Proclamation and their permanent and temporary/contract staff (Art. 3). *HR must confirm applicability to the College.* Status of all rows below: **Supplied – OCR-read; currently-in-force not independently verified.**

| Rule | Art. | Workflow affected | Implementation |
|---|---|---|---|
| Items are issued to permanent, probation and contract staff **assigned to an approved position** that is entitled to them | 7(1) | Eligible employees | Entitlement is matched to the employee's job title (`ppe_entitlements`); no entitlement → no issue |
| Staff receive the position's items **after six months** in the position. Exception: **chemical, health, garage and fire-fighting work** — from the assignment date | 7(2) | Eligibility | Setting `ppe_wait_months` (seeded `6`, from this article). Exception is a per-**item** flag (`immediate_eligibility`); the directive ties it to the *kind of work*, so HR should set it on items used in those jobs. **Approximation – to be confirmed.** |
| Items must be given **no later than Tahsas 30** of the budget year | 7(2) | Issuing | **Not modelled** (no deadline alert) |
| No claim for unused items after retirement, death or resignation | 7(3) | Separation | Not enforced; nothing is issued to former employees |
| A replacement employee in the position receives the entitlement; the institution must budget for it | 7(4) | Replacement | Issue is per employee, so a new holder is eligible after the waiting period |
| Acting/delegated or additional-duty staff receive the acting position's items after six months (immediately for the four exceptions). Where both positions entitle the same items, only the permanent position's are given; otherwise only the differing items are added | 7(5)–7(6) | Acting appointments | **Not modelled** — acting assignments are recorded but do not create an entitlement; HR issues manually with a documented reason |
| An employee who leaves the position is not asked to return items already received | 7(7) | Separation | Consistent (no return is demanded) |
| Purchase committee: 2 procurement/finance/property staff, 1 HR staff, 1 male and 1 female staff representative from different positions choose type and quality; then normal procurement | 7(8)–7(9) | Procurement | **Not modelled** |
| Items **not issued in a budget year do not carry over** to the next | 7(10) | Allocation | Implemented: the cap is per budget year (`ppe_issues.fiscal_year`) |
| Hot/cold-area variants only after an HR study and approval by the finance head | 7(11) | Allocation | Not modelled |
| Tailoring cost paid in cash for cloth; employee must have it sewn and be wearing it within one month, otherwise the institution's discipline committee may bring a case | 8(1)–8(2) | Allocation, discipline | **Not modelled** |
| Same position → same colour; purchase/tailoring price ceilings may be revised by up to 10% per budget year after a price study | 8(3)–8(5) | Procurement | Not modelled; no price is stored |
| **Annex 1 (items), Annex 2 (tailoring items), Annex 3 (items and quantities per job position)** | Annex | Entitlements | **Loaded, unverified.** Pages 21–27 were read from the page images and loaded into Uniform management (82 items, 480 entitlement rows) — see `docs/PPE_CATALOG_DIRECTIVE_173_2018.md`. Every row is *unverified* until HR confirms it. Illegible parts of page 27 were not guessed. Price ceilings are not stored |

Also from D1: the directive defines the terms *work clothing* and *work equipment* (Art. 2) and the fabrics for each garment (Art. 4–6); these are descriptive and not used by the system.

## C. Employee register (D2) — structure and findings

Sheet 1, header rows 1–15, data from row 16: 205 employees. Columns include a serial number, **digital ID number (FAN)** (this is the Fayda number), names (Amharic and English), sex, institute, directorate/unit, **pension number**, date of birth, education, hire date, service elsewhere/here, marital status, job title, grade, salary, new-hire/promotion/disability/training flags and employment type.

**The register contains no "ቋሚ የሰራተኛ መደብ ቁጥር" (permanent staff position number) column.** The system therefore leaves every position number empty and flags each employee for HR verification. It never derives one from the serial number, the pension number or the Fayda number.

Findings from the preview run (counts only; no personal data recorded here):
- 205 rows → 202 can be created, **3 are rejected** because the hire date is unreadable or missing (e.g. a date typed without separators).
- **Fayda/FAN:** 1 missing; 6 numbers have 12 instead of 16 digits; 10 rows share a number with another row (5 pairs). All are stored as *pending verification* and flagged; none is merged or discarded.
- **Pension number:** 14 rows share a number with another row — flagged.
- **Dates:** 106 hire dates and 108 birth dates are text in `d/m/yyyy` form and are read as **Ethiopian-calendar** dates (converted to Gregorian); 96 hire dates and 90 birth dates are real spreadsheet dates and are kept as the **Gregorian** date Excel holds. *Both readings are assumptions; every converted date is flagged for HR verification.*
- Salary is **not imported** unless `--with-salary` is given (payroll depends on it).

## D. Rules for which no governing text was supplied — configuration required

The system contains **no value** for any of these. Where the HR job descriptions mention a figure, it is listed as a pointer only.

| Topic | Needed from authorized HR | System behaviour until then |
|---|---|---|
| Probation length (module 1) | D4 says the HR Expert issues a **6-month** probationary appointment letter — *Supplied – internal; legal basis not supplied* | `probation_end` is entered per employee; no automatic length |
| Permanent appointment criteria | Governing proclamation/regulation | Requires a recorded *satisfactory* evaluation and an authorized decision |
| Promotion (grade advancement) eligibility, performance threshold, vacancy rules | Proclamation 309/2018 + promotion directive | Case workflow only; no automatic eligibility; basis and legal reference typed by HR |
| Acting / delegation rules (maximum period, allowances) | Governing rules | Recorded with dates; no limits enforced |
| Internal / external transfer rules | Governing rules | Workflow only; external transfer *out* opens a clearance checklist |
| Retirement age, minimum service, pension contribution and benefit | Pension law (not supplied) | **Retirement age = 60 years**, set on the instruction of the HRMS owner (24 Oct 2026) in `retirement_age_years`; its source is stored in `retirement_age_source` and reads *"law / directive reference not yet recorded"* until HR enters the governing article. **Status: instructed, not verified against a supplied legal text.** `retirement_min_service_years` stays blank (no minimum service assumed). Pension amounts are never computed. Change both on *Retirement → Change the retirement rule* |
| Termination grounds, notice, response period, appeal | Proclamation 309/2018 | Case requires a legal reference, recorded notice and employee response (or recorded waiver), a recommendation and an authorized decision; no ground is built in |
| Disciplinary offences and **sanctions**, procedure, appeal | Proclamation + discipline directive | Sanction list is **empty**; only "no sanction" is possible until an administrator adds sanctions with their source |
| Annual leave entitlement, carry-forward, special leaves | Proclamation + leave directive | The existing leave-type configuration is kept as built; **not verified against any supplied document** |
| Long-term education eligibility, sponsorship and return-service obligations | Training/education directive | Case workflow; obligations not computed |
| Training budget rules | Budget directive | Cost recorded only |
| **Who has authority to approve each case type** | Delegation of authority | Table `case_approval_rules`; all rows start **unverified**, default approver permission `cases.approve` (disciplinary: `discipline.decide`). HR confirms and marks each *verified* under *Staffing → Approval rules* |
| Fiscal-year boundaries | Budget calendar | Default July–June (Gregorian) is a **display default only** for grouping uniform issues; HR may pass the year explicitly |
| Fayda number format | Fayda authority | 16 digits regarded as well-formed (as in the register); anything else is "pending verification". Collection of Fayda numbers is a **data-protection decision for the College** (lawful basis) |

## E. Job descriptions (D3–D6) → system duties

| Duty (source) | Where in the system |
|---|---|
| Prepare the annual HR plan from the strategic plan (D3) | Annual HR plan module |
| Identify HR matters needing decision and submit them (D3) | HR cases → recommendation → authorized decision |
| Send required staff data to the Civil Service Ministry and the social-security agency (D3) | Reports (existing); no automated submission |
| Register recruitment, promotion and transfer applicants, run exams, issue probation letter with job description (D4) | Existing Recruitment module; permanent appointment case |
| Compile appraisal results, staff profiles, HR-plan data (D4) | Existing Performance module; employee profile; plan items |
| Handle confidential matters carefully (D6) | Confidential case types (disciplinary, termination), restricted listing, audited viewing |
| Messenger (D5) | No HR workflow |

## F. How a rule gets verified

1. HR compares the OCR-read or entered text with the original document and records the **source** (document, article, page).
2. For entitlements: tick *verified* on the row. For approval authority: mark the case-type rule *verified*. For settings: enter the value in Settings.
3. The change is audited (`audit_logs`). Unverified rows remain visibly marked.
