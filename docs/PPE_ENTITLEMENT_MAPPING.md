# Uniform and work-tool entitlements by job title (Directive No. 173/2018)

## What was wrong
The directive (Annex 3) gives entitlements to **named government occupations** ("የጥበቃ ሰራተኛ", "ሹፌር" ...). The college's job titles come from its own job grading ("ጥበቃ ሰራተኛ Il", "ሾፌር l"). The system compared the two letter for letter, so **nobody matched** and HR saw "ይህ እቃ ለሠራተኛው የሥራ መደብ አልተፈቀደም (መብት አልተዘጋጀም)" for every employee.

## What was done
* A **job-title mapping** (table `ppe_title_map`, migration `011_ppe_title_map.sql`) links a college job title to the directive occupation it is. Entitlements are still the directive's own 480 lines (items, quantities, replacement periods, annex and PDF page): **nothing was invented, changed or deleted**. They now follow the employee's job title automatically, so HR never configures an entitlement employee by employee.
* **Automatic matching** (the same process runs at upgrade, from the screen *Uniform management -> Job-title mapping -> Run the matching*, and from the command line) links a title only when it is the same occupation written differently: the grade marker (I, II, Il, ll ...), a leading "የ" and spelling variants of one letter (ሠ/ሰ, ሐ/ኀ/ሀ, ዐ/አ, ጸ/ፀ, ሾ/ሹ) are ignored; the generic words "ሰራተኛ" (worker) and "ባለሙያ" (expert) may be left out. A title that fits occupations of different Annex groups is ambiguous and goes to HR review.
* Items the directive names "for men" / "for women" apply to that sex only (`ppe_items.applies_to_sex`, migration `012_ppe_item_sex.sql`, set only from the directive's own item names).
* **Employees without a matching occupation are not given anything.** They are listed for HR review with the closest occupations; HR can confirm that a title is the same occupation (a reason is required, it is audited and can be switched off). Only HR can do this.
* Issuing (HR only): the form shows employee, ID, job title, item, **authorized quantity**, issued quantity, date, replacement or new issue, the responsible HR officer (the signed-in user) and remarks; the employee acknowledges receipt afterwards. Beyond the authorized quantity or before the waiting period ends, an issue is refused unless the **HR Manager** (permission `ppe.exception`) records an exception with a reason and the reference of the authorization; it is audited. An item that is not on the employee's list is never issued.
* The employee profile has a new section **Uniforms and work tools** (HR): every entitled item with authorized quantity, replacement/service period, issued, remaining and the source.
* Running the process again changes nothing (no duplicated link, no duplicated entitlement). Existing items, entitlements, stock and issue history are untouched (this database had 82 items, 480 entitlements, 0 issues before and after).

## Result on the 205 employees (actual database)
| | |
|---|---|
| Employees processed | **205** (39 distinct job titles) |
| Matched to an occupation of the directive | **42 employees** (7 job titles), **245 entitlement lines**, 4 to 7 items per employee depending on the job and the sex |
| For HR review (no occupation of that title in the directive) | **163 employees** (32 job titles) - they receive no invented entitlement |
| Existing issues / stock / entitlements / items | unchanged (0 issues, 480 entitlements, 82 items) |

The employee-level result is in `docs/import-reports/ppe_title_mapping_205_employees.csv` (employee number, job title, matched or HR review, directive occupation; no names).

## Job titles matched (authorized items, quantities, periods)
Items marked "for men" or "for women" apply only to employees of that sex.

### ጥበቃ ሰራተኛ Il - 22 employees

Directive occupation: የጥበቃ ሰራተኛ (basis: automatic_exact)

| Item | Type | Authorized quantity | Replacement / service period | Source |
|---|---|---|---|---|
| Men's coat and trousers (tailored) / ለወንድ ኮትና ሱሪ | clothing | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 1, PDF p.24 |
| Overcoat (with lining) / ካፖርት (ባለገበር) | clothing | 1 | every 36 months | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 1, PDF p.24 |
| Shirt / ሸሚዝ | clothing | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 1, PDF p.24 |
| Women's jacket and straight skirt (tailored) / ለሴት ጃኬትና ጉርድ ቀሚስ | clothing | 1 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 1, PDF p.24 |
| Women's matching shirt and trousers (tailored) / ለሴት አንድ ወጥ ሸሚዝና ሱሪ | clothing | 1 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 1, PDF p.24 |
| Rubber/plastic boots (with lining) / የፕላስቲክ ቡትስ ጫማ ባለገበር | footwear | 1 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 1, PDF p.24 |
| Short leather shoes / አጭር ቆዳ ጫማ ከቆዳ የተሰራ | footwear | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 1, PDF p.24 |
| Rain clothing / የዝናብ ልብስ | protective_clothing | 1 | every 36 months | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 1, PDF p.24 |

### ጽዳትና ተላላኪ Il - 10 employees

Directive occupation: ፅዳትና ተላላኪ ሰራተኛ (basis: automatic_equivalent)

| Item | Type | Authorized quantity | Replacement / service period | Source |
|---|---|---|---|---|
| Men's coat and trousers (tailored) / ለወንድ ኮትና ሱሪ | clothing | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 3, PDF p.24 |
| Shirt / ሸሚዝ | clothing | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 3, PDF p.24 |
| Women's jacket and straight skirt (tailored) / ለሴት ጃኬትና ጉርድ ቀሚስ | clothing | 1 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 3, PDF p.24 |
| Women's matching shirt and trousers (tailored) / ለሴት አንድ ወጥ ሸሚዝና ሱሪ | clothing | 1 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 3, PDF p.24 |
| Short leather shoes / አጭር ቆዳ ጫማ ከቆዳ የተሰራ | footwear | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 3, PDF p.24 |
| Fabric hair-covering cap / ከጨርቅ የተሰራ የፀጉር መሸፈኛ ቆብ | protective_clothing | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 3, PDF p.24 |
| Full apron (tailored) / ለሙሉ ሽርጥ | protective_clothing | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 3, PDF p.24 |
| Gloves (material not specified) / የእጅ ጓንት | protective_clothing | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 3, PDF p.24 |

### ሾፌር l - 5 employees

Directive occupation: ሹፌር (basis: automatic_exact)

| Item | Type | Authorized quantity | Replacement / service period | Source |
|---|---|---|---|---|
| Coat and trousers (as printed for drivers and assistants) / ኮትና ሱሪ | clothing | 1 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 7, PDF p.25 |
| Shirt / ሸሚዝ | clothing | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 7, PDF p.25 |
| Short leather shoes / አጭር ቆዳ ጫማ ከቆዳ የተሰራ | footwear | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 7, PDF p.25 |
| Coverall (tailored) / ለቱታ | protective_clothing | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 7, PDF p.25 |

### ሾፌር II - 2 employees

Directive occupation: ሹፌር (basis: automatic_exact)

| Item | Type | Authorized quantity | Replacement / service period | Source |
|---|---|---|---|---|
| Coat and trousers (as printed for drivers and assistants) / ኮትና ሱሪ | clothing | 1 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 7, PDF p.25 |
| Shirt / ሸሚዝ | clothing | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 7, PDF p.25 |
| Short leather shoes / አጭር ቆዳ ጫማ ከቆዳ የተሰራ | footwear | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 7, PDF p.25 |
| Coverall (tailored) / ለቱታ | protective_clothing | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 7, PDF p.25 |

### ሁለገብ ጥገና ሰራተኛ Ill - 1 employees

Directive occupation: ሁለገብ ጥገና ሠራተኛ (basis: automatic_exact)

| Item | Type | Authorized quantity | Replacement / service period | Source |
|---|---|---|---|---|
| Fabric cap (tailored) / ለጨርቅ ቆብ | clothing | 1 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 8, PDF p.26 |
| Safety leather shoes / ሴፍቲ ቆዳ ጫማ ከቆዳ የተሰራ | footwear | 1 | every 24 months | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 8, PDF p.26 |
| Short leather shoes / አጭር ቆዳ ጫማ ከቆዳ የተሰራ | footwear | 1 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 8, PDF p.26 |
| Coverall (tailored) / ለቱታ | protective_clothing | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 8, PDF p.26 |
| Gloves of cloth (ሽራ) or plastic / የእጅ ጓንት ከሽራ ወይም ከፕላስቲክ የተሰራ | protective_clothing | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 8, PDF p.26 |

### እግረኛ ፖስተኛ - 1 employees

Directive occupation: እግረኛ ፖስተኛ

| Item | Type | Authorized quantity | Replacement / service period | Source |
|---|---|---|---|---|
| Men's coat and trousers (tailored) / ለወንድ ኮትና ሱሪ | clothing | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 3, PDF p.24 |
| Shirt / ሸሚዝ | clothing | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 3, PDF p.24 |
| Women's jacket and straight skirt (tailored) / ለሴት ጃኬትና ጉርድ ቀሚስ | clothing | 1 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 3, PDF p.24 |
| Women's matching shirt and trousers (tailored) / ለሴት አንድ ወጥ ሸሚዝና ሱሪ | clothing | 1 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 3, PDF p.24 |
| Short leather shoes / አጭር ቆዳ ጫማ ከቆዳ የተሰራ | footwear | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 3, PDF p.24 |
| Umbrella / ጃንጥላ | protective_clothing | 1 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 3, PDF p.24 |

### ጥበቃ ሰራተኛ ተቆጣጣሪ Il - 1 employees

Directive occupation: ጥበቃ ተቆጣጣሪ (basis: automatic_equivalent)

| Item | Type | Authorized quantity | Replacement / service period | Source |
|---|---|---|---|---|
| Men's coat and trousers (tailored) / ለወንድ ኮትና ሱሪ | clothing | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 1, PDF p.24 |
| Overcoat (with lining) / ካፖርት (ባለገበር) | clothing | 1 | every 36 months | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 1, PDF p.24 |
| Shirt / ሸሚዝ | clothing | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 1, PDF p.24 |
| Women's jacket and straight skirt (tailored) / ለሴት ጃኬትና ጉርድ ቀሚስ | clothing | 1 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 1, PDF p.24 |
| Women's matching shirt and trousers (tailored) / ለሴት አንድ ወጥ ሸሚዝና ሱሪ | clothing | 1 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 1, PDF p.24 |
| Rubber/plastic boots (with lining) / የፕላስቲክ ቡትስ ጫማ ባለገበር | footwear | 1 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 1, PDF p.24 |
| Short leather shoes / አጭር ቆዳ ጫማ ከቆዳ የተሰራ | footwear | 2 | per year | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 1, PDF p.24 |
| Rain clothing / የዝናብ ልብስ | protective_clothing | 1 | every 36 months | Directive 173/2018 Annex 3 (አባሪ 3) ተ.ቁ 1, PDF p.24 |


## Job titles for HR review (no entitlement until HR confirms)
These titles do not name an occupation that Annex 3 of the directive, as imported from the PDF (pages 4-27), gives entitlements to: instructors, administrators, accountants, HR staff, secretaries, store and library staff and similar posts are not in the annex. If HR holds a decision or an annex that covers a title, HR links it under *Job-title mapping*. The annex group 11 has a title that could not be read from the PDF scan (5 lines); it is not matched to anyone.

| Employees | Job title | Closest occupations in the directive (for HR to confirm or ignore) |
|---|---|---|
| 78 | የB- ኢንስትራክተር | - |
| 29 | የA- ኢንስትራክተር | - |
| 9 | ወርክ ሾፕ ቴክኒሺያን IV | የእንጨት ሥራ ቴክኒሺያን/ባለሙያ |
| 5 | የተማሪዎች ሪከርድ ሰራተኛ ll | - |
| 4 | የቤተመጽሃፍት ዶክመቴሽን ቦለሙያ l | - |
| 3 | አካውታት III | - |
| 3 | እቃ ግምጃ ቤት ኃላፊ I | - |
| 3 | የC- አሰልጣኝ | - |
| 3 | ግዥ ባለሙያ III | - |
| 2 | ምክትል ዲን/የA-ኢንስትራክተር | - |
| 2 | ሴክሬታሪ II | - |
| 2 | የC አሰልጣኝ | - |
| 1 | መረጃ ደስክ ሰራተኛ l | - |
| 1 | ሬጅስትራር 1/የተማሪዎችና የሠልጣኞች/ | - |
| 1 | ሴክሬታሪ Il | - |
| 1 | ሴክሬታሪና የሂሳብ ሰነድ ያዥ | - |
| 1 | አቤቱታና ቅሬታ ማ/ባለ ሙያ III | - |
| 1 | አዲት ቡደን መሪ | - |
| 1 | ኤክስኪዩቲቪ ሴክሬታሪ l | - |
| 1 | ዋና ገንዘብያዥ II | - |
| 1 | የA-ኢንስትራክተር | - |
| 1 | የህዝብ ግንኙነት ባለሙያ III | - |
| 1 | የሪከርድና ማህደር ሰራተኛ II | - |
| 1 | የሰው ሀብት አስተዳደር ቡድን መሪ | - |
| 1 | የሰው ሀብት አስተዳደር ባለሙያ III | - |
| 1 | የቅድና በጀት ዝግጅት ክ/ግ/ባለ. III | - |
| 1 | የአዲት ባለሙያ 3 | - |
| 1 | የኦዲቪዣዋል ፣ የህትመት ክትትልና ስርጭት ሰራተኛ vI | - |
| 1 | የግ/ፋ/ን/አስ/ቡድን መሪ II | - |
| 1 | ዲን/የA-ኢንስትራክተር | - |
| 1 | ጠቅላላ አገልግሎተ ኃላፊ l | - |
| 1 | ፎቶ ኮፒና ማባዣ ሰራተኛ I | - |

## Commands
```
cd backend
npm run db:init                          # applies 011 and 012 and links the safe matches (once)
npm run ppe:map                          # preview of the matching (writes nothing)
node src/map-ppe-titles.js --apply       # run it again at any time (idempotent)
node src/map-ppe-titles.js --csv report.csv
npm run test:ppe-titles                  # development database only
```
Security: only HR (`ppe.manage`) sees the mapping, issues items, reads entitlements and issue logs and runs reports; only the HR Manager holds `ppe.exception`. The executive, line managers, employees, the system administrator and the technical account are refused (tested).
