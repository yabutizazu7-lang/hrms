# Employee register: the 27 columns, their database fields and the import

Source: workbook `205_Final_A_REPORT_Nehase_2018_ሰ` (3 sheets). **Authoritative sheet:** `KPC Total 205 EMPLOYEES 2019` - header on row 15, data from row 16, 27 columns. The other two sheets are not employee lists (`XII=Gret INST_ LEADERS _EXPERT` = education-evidence table; `Less than XII MEDIUM EMPLOYEES` = an empty copy of the header) and are not imported.
Found: **205 data rows, 205 unique serial numbers (ተ.ቁ 1-205), 205 unique rows, no row repeated.**

## 1. Mapping (every source column -> destination)
| # | Excel heading | Database field (`employees`) | Type | UI section | Who can see it |
|---|---|---|---|---|---|
| 1 | ተ.ቁ | `register_no` (unique, **not** the key) | integer | 1 Personal and identity | HR |
| 2 | የዲጅታል መታወቂያ ቁጥር (FAN) | `fayda_fan` (+ `fayda_status`) | text | Identifiers card | masked; full number needs `fayda.view`, audited |
| 3 | ስም ከነአያት በአማርኛ | `full_name_am` (exact) + `first_name`, `father_name`, `grandfather_name` | text | 1 | everyone who can see the employee |
| 4 | ስም ከነአያት በእንግሊዘኛ | `full_name_en` (exact) | text | 1 | everyone who can see the employee |
| 5 | ፆታ | `sex` (ወ = male, ሴ = female) | text | 1 | everyone |
| 6 | የሚሰሩበት ተቋም / መስሪያ ቤት | `workplace` | text | 2 Institution and department | HR |
| 7 | የዳይሬክቶሬት / ቡድን / Department | `department_id` -> `departments` | integer | 2 | everyone |
| 8 | የጡረታ መለያ ቁጥር | `pension_no` ("የለም" = none -> NULL) | text | 1 | `employees.sensitive` |
| 9 | የትውልድ ቀን / ወር / ዓመት | `date_of_birth` (Ethiopian -> Gregorian) | date | 1 | HR |
| 10 | ብሔር / ብሔረሰብ | `ethnicity` | text | 1 | `employees.sensitive` |
| 11 | የትምህርት ዓይነት | `education_field` | text | 3 Education and training | HR |
| 12 | የትምህርት ደረጃ | `education_level` (as written: ድግሪ, 2ኛ ድግሪ, ደረጃ 4 ...) | text | 3 | HR |
| 13 | በመጀመሪያ ሲቀጠሩ የተቀጠሩበት ቀን | `hire_date` (Ethiopian -> Gregorian) | date | 4 Employment and service | HR |
| 14 | የአገልግሎት ዘመን በሌላ መ/ቤት | `prior_service_text` (as written) | text | 4 | HR |
| 15 | የአገልግሎት ዘመን በመ/ቤቱ | `institution_service_text` | text | 4 | HR |
| 16 | ጠቅላላ የአገልግሎት ዘመን | `total_service_text` | text | 4 | HR |
| 17 | የጋብቻ ሁኔታ | `marital_status` | text | 6 Marital status and children | HR |
| 18 | የልጅ 1 የልደት ቀን | `child1_dob` | date | 6 | `employees.sensitive` |
| 19 | የልጅ 2 የልደት ቀን | `child2_dob` | date | 6 | `employees.sensitive` |
| 20 | የሥራ መደብ መጠሪያ በJEG | `jeg_title` (+ `position_id` -> `positions` when the title exists) | text | 5 Job position, grade, salary | HR |
| 21 | የሥራ መደብ ደረጃ | `job_grade` (+ `positions.grade`) | text | 5 | HR |
| 22 | ደመወዝ | `basic_salary` (only when the cell is a number > 0) | numeric | 5 | `salary.view` |
| 23 | በበጀት ዓመቱ አዲስ የተቀጠሩ | `newly_hired_fy` (√ = true, blank = not marked) | boolean | 8 Annual hiring and promotion | HR |
| 24 | በበጀት ዓመቱ ደረጃ ዕድገት ያገኙ | `promoted_fy` | boolean | 8 | HR |
| 25 | የአካል ጉዳት ሁኔታና ዓይነት | `disability` (empty = none recorded) | text | 7 Disability | `employees.sensitive` |
| 26 | የረጅም ጊዜ ሥልጠና አገርና ደረጃ | `long_term_training` | text | 3 | HR |
| 27 | የቅጥር ሁኔታ ቋሚ / ኮንትራት | `employment_type` (ቋሚ -> permanent, ኮንትራት -> contract) | text | 4 | everyone |

Migration **`008_register_fields.sql`** adds the 18 missing columns (1, 3, 4, 6, 10, 11, 12, 14, 15, 16, 18, 19, 20, 21, 23, 24, 25, 26), a unique partial index on `register_no`, and indexes on education level, grade and Amharic name. It is additive: no row, column or relation is changed. Fields 2, 5, 7, 8, 9, 13, 17, 22 and 27 already existed.
All 27 are on the employee form (8 sections), the employee detail page, the API (`POST/PUT/GET /employees`), the register view (sorted by ተ.ቁ), and the filters (department, gender, employment type, education level, job grade).

## 2. Rules the import follows
* Match order: FAN -> pension number -> exact name (only when unique). Never the name alone when an identifier exists. A FAN or pension number that appears twice in the register is never used for matching; both rows are flagged.
* New employee: inserted. Existing employee: **only empty fields are filled**. A different existing value is **kept and reported** (`conflict: <field> ...`, field names only). Blank Excel cells never erase data.
* Nothing is invented: unreadable dates, invalid salaries and "none" pensions become NULL and are listed for HR.
* Dates: the register is Ethiopian. Text `d/m/yyyy` is converted directly; spreadsheet date cells (Excel read `d/m/yyyy` as `m/d/yyyy`) are decoded back (day and month swapped). Every conversion is flagged "verify".
* FAN, pension numbers and names are text (leading zeros and Ethiopic spelling kept exactly; names only trimmed at the ends).
* One transaction per apply: all rows or none. Repeating the same file changes nothing (second run: 0 inserted, 0 updated, 205 unchanged). No `DELETE` / `TRUNCATE` on employees anywhere in the import; undo removes only employees a batch inserted that have no other records, and empties only the fields it filled.
* The register has no permanent-position-number column, so every employee carries the "position number missing" flag (not invented).

## 3. Result on the supplied file
| | |
|---|---|
| Rows found / valid / invalid | 205 / 205 / 0 |
| Possible duplicates (repeated FAN or pension number, flagged, not merged) | 13 rows (FAN repeated: 10, pension repeated: 4; some rows overlap) |
| First import (earlier batch 1) | 205 inserted |
| This import (batch 2, new fields) | 0 inserted, **205 updated**, 0 skipped, 0 failed |
| Repeat run | 0 inserted, 0 updated, 205 skipped |
| Field-by-field verification (`verify-register.js`, all 27 fields incl. serial, both names, children, flags, disability, training) | **0 mismatches** |
| Populated after import | serial 205 · Amharic name 205 · English name 205 · workplace 205 · ethnicity 205 · education field 205 · level 205 · three service durations 205 · JEG title 205 · grade 205 · salary 205 · marital 204 · FAN 204 · pension 195 · date of birth 197 · hire date 205 · child 1 date 5 · child 2 date 4 · newly hired ✓ 9 · promoted ✓ 28 · disability 2 · long-term training 122 · employment type: 205 permanent |

Not importable (left empty, listed in the report): 8 dates of birth (4 impossible as Ethiopian dates, 4 unreadable text such as `5/12/181`), 1 second-child date (`1899-12-31`), 1 missing FAN, 6 FANs that are not 16 digits and 10 repeated FANs (stored as "pending verification"), 10 employees whose pension cell says "የለም" (no pension), and 1 employment type that reads "ቋሚ/ጊዜዊ ምደባ" (kept as permanent, flagged). The ተ.ቁ is stored as given (1-205).

## 4. Commands
```
cd backend
pg_dump -U postgres -Fc hrms > hrms_before_008.dump      # backup first
npm run db:init                                           # applies 008 (additive)
node src/import-register.js --file "<register.xlsx>" --with-salary            # PREVIEW: writes nothing
node src/import-register.js --file "<register.xlsx>" --with-salary --apply    # APPLY: one transaction
node src/verify-register.js --file "<register.xlsx>" --with-salary            # compares all 27 fields, read-only
node src/import-register.js --rollback <batchId>                              # undo a batch
npm run test:register                                     # development database only
```

## 5. The import screen (Employee register import, needs `import.manage`: HR Manager and Super Admin)
1. Menu **Employee register import** -> choose the `.xlsx` file. Tick *Also import the salary column* only if you may set salaries.
2. **Preview (nothing is saved)** shows rows found, valid, invalid, possible duplicates, new / updated / unchanged, and every issue per row. **Download the error report (CSV)** gives row numbers and issues (no names or ID numbers).
3. Tick the confirmation, then **Apply the import**. It is one transaction; the result and a per-row report stay under *Previous imports*.
4. *Report* downloads the report of an earlier import; *Undo* reverses it where that is safe.
The file is held in a temporary file (permissions 600) for one request and deleted; it is never stored by the application.
