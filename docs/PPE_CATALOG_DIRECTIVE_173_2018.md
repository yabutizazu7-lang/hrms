# Work clothing and work equipment catalogue — Directive No. 173/2018 E.C., PDF pages 4–27

Source: *የተሻሻለው የመንግስት ሠራተኞች የሥራ ልብስና የሥራ መሣሪያዎች አሰጣጥና አጠቃቀም መመሪያ ቁጥር 173/2018* (scanned PDF supplied by the College). **Only pages 4–27 were used.** The scan has no text layer; Amharic OCR was not trusted for tables, so the item lists were **read from the page images** and checked by tests against the data file.

Everything here is loaded into *Uniform management* from `backend/db/seed/ppe_directive_173_2018.json` (loader `backend/src/seed-ppe.js`, run once by `npm run db:init`, or on demand with `npm run seed:ppe`). Loading is **non-destructive**: an item whose code or Amharic name already exists is reused and never changed; existing entitlements are never overwritten. **All entitlements are loaded as *unverified*** — HR confirms them against the original (Entitlements tab → *Mark as verified*).

## What was found on pages 4–27

| PDF pages | Content | What was loaded |
|---|---|---|
| 4–7 | Art. 1–3: short title, definitions (Art. 2), scope. Definitions name the garments, fabrics and shoes and the work equipment (Art. 2(4)) | Garment/shoe/equipment items; Art. 2(4) tools (9) |
| 7–8 | Art. 4 fabrics, Art. 5 shoe types | Items for fabrics and the two Art. 5 shoe types not listed elsewhere; fabric use recorded in item notes |
| 8–9 | Art. 6 garment styles and substitutions | Recorded in item notes (women may choose the style; field jacket may replace the overcoat if none is available; an umbrella replaces rain clothing if none is available) |
| 9–27 | Art. 7–8 issuing rules (already in the rules register), **Annex 1** (pp. 21–22, 43 items with unit), **Annex 2** (p. 23, 16 tailoring items), **Annex 3** (pp. 24–27, items and quantities per job position) | Items (Annexes 1–2), entitlements (Annex 3) |

Prices (Annex 1 purchase ceilings, Annex 2 tailoring ceilings) are **not stored**: the task asked for items, quantities, categories and rules only.

## Items loaded: 82

### Fabric / ጨርቅ (4)

| Code | Amharic (as printed) | English | Kind | Unit | Source |
|---|---|---|---|---|---|
| D173-A1-01 | ብትን ጨርቅ ከካኪ የተሰራ | Khaki fabric, cut length (100% cotton khaki) | clothing | metre | Annex 1 (አባሪ 1) #1 |
| D173-A1-02 | ብትን ጨርቅ ከፖሊስተር ካኪ የተሰራ ወይም 6000 ቴትረን | Polyester-khaki or Tetron 6000 fabric, cut length | clothing | metre | Annex 1 (አባሪ 1) #2 |
| D173-A1-35 | ቆዳ መሰል የላስቲክ ጨርቅ | Leather-like plastic fabric, cut length | clothing | metre | Annex 1 (አባሪ 1) #35 |
| D173-A1-43 | አንፀባራቂ ብትን ጨርቅ ከላን የተሰራ | Reflective fabric, cut length (linen) | clothing | metre | Annex 1 (አባሪ 1) #43 |

### Work clothing / የሥራ ልብስ (19)

| Code | Amharic (as printed) | English | Kind | Unit | Source |
|---|---|---|---|---|---|
| D173-A1-03 | ሸሚዝ | Shirt | clothing | piece | Annex 1 (አባሪ 1) #3 |
| D173-A1-04 | ካፖርት (ባለገበር) | Overcoat (with lining) | clothing | piece | Annex 1 (አባሪ 1) #4 |
| D173-A1-12 | የስፖርት ቱታ (ኮትና ሱሪ ሙሉ) | Sports tracksuit (full coat and trousers) | clothing | piece | Annex 1 (አባሪ 1) #12 |
| D173-A1-13 | ቲሸርት | T-shirt | clothing | piece | Annex 1 (አባሪ 1) #13 |
| D173-A1-15 | ሌዘር ጃኬት | Leather jacket | clothing | piece | Annex 1 (አባሪ 1) #15 |
| D173-A2-01 | ለሴት ጃኬትና ጉርድ ቀሚስ | Women's jacket and straight skirt (tailored) | clothing | piece | Annex 2 (አባሪ 2) #1 |
| D173-A2-02 | ለሴት አንድ ወጥ ሸሚዝና ሱሪ ወይም ቀሚስ | Women's matching shirt and trousers, or dress (tailored) | clothing | piece | Annex 2 (አባሪ 2) #2 |
| D173-A2-03 | ለሴት አንድ ወጥ ሸሚዝና ሱሪ | Women's matching shirt and trousers (tailored) | clothing | piece | Annex 2 (አባሪ 2) #3 |
| D173-A2-05 | ለ¾ኛ ካፖርት/ጋወን | ¾ coat / gown (tailored) | clothing | piece | Annex 2 (አባሪ 2) #5 |
| D173-A2-08 | ለጨርቅ ቆብ | Fabric cap (tailored) | clothing | piece | Annex 2 (አባሪ 2) #8 |
| D173-A2-10 | ለወንድ አንድ ወጥ ሸሚዝና ሱሪ | Men's matching shirt and trousers (tailored) | clothing | piece | Annex 2 (አባሪ 2) #10 |
| D173-A2-11 | ለወንድ ኮትና ሱሪ | Men's coat and trousers (tailored) | clothing | piece | Annex 2 (አባሪ 2) #11 |
| D173-A2-12 | ቆዳ መሰል የላስቲክ ጨርቅ ኮትና ሱሪ ወይም ጃኬትና ሱሪ ለወንድ | Leather-like plastic-fabric coat and trousers, or jacket and trousers, for men (tailored) | clothing | piece | Annex 2 (አባሪ 2) #12 |
| D173-A2-13 | ቆዳ መሰል የላስቲክ ጨርቅ ኮትና ሱሪ ወይም ጃኬትና ሱሪ ወይም ቀሚስ ለሴት | Leather-like plastic-fabric coat and trousers, or jacket and trousers, or dress, for women (tailored) | clothing | piece | Annex 2 (አባሪ 2) #13 |
| D173-A3-01 | ኮትና ሱሪ | Coat and trousers (as printed for drivers and assistants) | clothing | piece | Annex 3 (አባሪ 3) group 3 |
| D173-A3-04 | ቆዳ መሰል የላስቲክ ኮትና ሱሪ ወይም ጃኬትና ሱሪ/ቀሚስ | Leather-like plastic coat and trousers, or jacket and trousers/dress | clothing | piece | Annex 3 (አባሪ 3) group 6 |
| D173-ART-01 | ፊልድ ጃኬት | Field jacket | clothing | piece | Art. 2(16) |
| D173-ART-02 | የጤና ባለሙያ ሙሉ የደንብ ልብስ | Health professional full uniform | clothing | piece | Art. 2(17) |
| D173-ART-03 | ጥቁር ሰማያዊ ደረጃውን የጠበቀ የደንብ ልብስ | Dark-blue standard uniform (pharmacy, radiology, physiotherapy) | clothing | piece | Art. 2(26) |

### Protective clothing / መከላከያ ልብስ (17)

| Code | Amharic (as printed) | English | Kind | Unit | Source |
|---|---|---|---|---|---|
| D173-A1-05 | የዝናብ ልብስ | Rain clothing | clothing | piece | Annex 1 (አባሪ 1) #5 |
| D173-A1-18 | የእጅ ጓንት ፕላስቲክ የተሰራ | Gloves made of plastic | clothing | pair | Annex 1 (አባሪ 1) #18 |
| D173-A1-19 | የእጅ ጓንት ከሽራ የተሰራ | Gloves made of cloth (ሽራ) | clothing | pair | Annex 1 (አባሪ 1) #19 |
| D173-A1-20 | የእጅ ጓንት ከሌዘር የተሰራ | Gloves made of "leather" (ሌዘር) | clothing | pair | Annex 1 (አባሪ 1) #20 |
| D173-A1-23 | የኬሚካል መከላከያ ቱታ ከነ ቆቡ | Chemical-protection coverall with hood | clothing | piece | Annex 1 (አባሪ 1) #23 |
| D173-A1-24 | ጃንጥላ | Umbrella | clothing | piece | Annex 1 (አባሪ 1) #24 |
| D173-A1-26 | የላስቲክ ሽርጥ (አፕሮን) | Plastic apron | clothing | metre | Annex 1 (አባሪ 1) #26 |
| D173-A1-37 | ከቆዳ የተሰራ የእጅ ጓንት | Gloves made of leather (hide) | clothing | pair | Annex 1 (አባሪ 1) #37 |
| D173-A2-04 | ለሙሉ ሽርጥ | Full apron (tailored) | clothing | piece | Annex 2 (አባሪ 2) #4 |
| D173-A2-06 | ለቱታ | Coverall (tailored) | clothing | piece | Annex 2 (አባሪ 2) #6 |
| D173-A2-16 | አንፀባራቂ ሰደርያ | Reflective vest (ሰደርያ) | clothing | piece | Annex 2 (አባሪ 2) #16 |
| D173-A3-02 | ከጨርቅ የተሰራ የፀጉር መሸፈኛ ቆብ | Fabric hair-covering cap | clothing | piece | Annex 3 (አባሪ 3) group 3 |
| D173-A3-03 | የእጅ ጓንት | Gloves (material not specified) | clothing | pair | Annex 3 (አባሪ 3) group 3 |
| D173-A3-06 | የእጅ ጓንት ከሽራ ወይም ከፕላስቲክ የተሰራ | Gloves of cloth (ሽራ) or plastic | clothing | pair | Annex 3 (አባሪ 3) group 7 |
| D173-A3-07 | የእጅ ጓንት ከሽራ ወይም ከሌዘር የተሰራ | Gloves of cloth (ሽራ) or "leather" (ሌዘር) | clothing | pair | Annex 3 (አባሪ 3) group 10 |
| D173-A3-08 | የላስቲክ ጓንት | Rubber/plastic gloves | clothing | pair | Annex 3 (አባሪ 3) group 11 |
| D173-ART-04 | ሙሉ ጋወን (አረንጓዴ) | Full gown, green (operating theatre and delivery) | clothing | piece | Art. 2(27) |

### Uniforms and ceremonial clothing / የደንብና የሥነ ሥርዓት ልብስ (9)

| Code | Amharic (as printed) | English | Kind | Unit | Source |
|---|---|---|---|---|---|
| D173-A1-16 | ሙሉ የባህል ልብስ ለወንድ (እንደየ አካባቢው ባህል) | Full traditional clothing for men (according to local culture) | clothing | piece | Annex 1 (አባሪ 1) #16 |
| D173-A1-17 | ሙሉ የባህል ልብስ ለሴት (እንደየ አካባቢው ባህል) | Full traditional clothing for women (according to local culture) | clothing | piece | Annex 1 (አባሪ 1) #17 |
| D173-A1-21 | ሱፍ ኮትና ሱሪ (ጥራቱን የጠበቀ የሃገር ውስጥ ምርት) | Wool-blend suit, coat and trousers (quality local product) | clothing | piece | Annex 1 (አባሪ 1) #21 |
| D173-A1-22 | ክራባት | Necktie | clothing | piece | Annex 1 (አባሪ 1) #22 |
| D173-A1-32 | የትክሻ ባጅ (መለዮ) | Shoulder badge (insignia) | clothing | piece | Annex 1 (አባሪ 1) #32 |
| D173-A1-33 | የአበነብስ ጥቁር ፈረጅያ | Black robe (ፈረጅያ) of the "አበነብስ" | clothing | piece | Annex 1 (አባሪ 1) #33 |
| D173-A1-34 | የአበነብስ ክብ ቆብ | Round cap of the "አበነብስ" | clothing | piece | Annex 1 (አባሪ 1) #34 |
| D173-A2-07 | ለአበነብስ ቀሚስና ሱሪ | Dress/robe and trousers of the "አበነብስ" (tailored) | clothing | piece | Annex 2 (አባሪ 2) #7 |
| D173-A2-09 | ለችሎት ካባ | Court robe (tailored) | clothing | piece | Annex 2 (አባሪ 2) #9 |

### Footwear / ጫማ (10)

| Code | Amharic (as printed) | English | Kind | Unit | Source |
|---|---|---|---|---|---|
| D173-A1-06 | የፕላስቲክ ቡትስ ጫማ ባለገበር | Rubber/plastic boots (with lining) | footwear | pair | Annex 1 (አባሪ 1) #6 |
| D173-A1-07 | ቡትስ ቆዳ ጫማ ከቆዳ የተሰራ | Leather boots (long) | footwear | pair | Annex 1 (አባሪ 1) #7 |
| D173-A1-08 | አጭር ቆዳ ጫማ ከቆዳ የተሰራ | Short leather shoes | footwear | pair | Annex 1 (አባሪ 1) #8 |
| D173-A1-09 | አጭር ቡትስ ቆዳ ጫማ ከቆዳ የተሰራ | Short leather boots (ankle boots) | footwear | pair | Annex 1 (አባሪ 1) #9 |
| D173-A1-10 | ሴፍቲ ቆዳ ጫማ ከቆዳ የተሰራ | Safety leather shoes | footwear | pair | Annex 1 (አባሪ 1) #10 |
| D173-A1-11 | የስፖርት ጫማ (ቶርሽን/ስኒከር) | Sports shoes (torsion / sneakers) | footwear | pair | Annex 1 (አባሪ 1) #11 |
| D173-A1-14 | የባህል ጫማ | Traditional shoes | footwear | pair | Annex 1 (አባሪ 1) #14 |
| D173-ART-05 | ዶክተር ሹዝ ጫማ | Doctor shoes (white) | footwear | pair | Art. 5(8) |
| D173-ART-06 | ከበድ ላለ የሲቪል ስራ የሚውል ንዝረትን የሚከላከል ሶል ያለው ጫማ | Heavy-duty civil work shoes with vibration-resistant sole (short, short boot or long boot) | footwear | pair | Art. 5(4) |
| D173-ART-07 | ለሴቶች ቀለል ያለ ክብደት ያለው የቆዳ ጫማ | Lightweight leather shoes for women (short, short boot or long boot) | footwear | pair | Art. 5(5) |

### Protective equipment / መከላከያ መሣሪያ (8)

| Code | Amharic (as printed) | English | Kind | Unit | Source |
|---|---|---|---|---|---|
| D173-A1-25 | የብረት ቆብ/ማይካ/ | Metal helmet ("mica") | equipment | piece | Annex 1 (አባሪ 1) #25 |
| D173-A1-27 | የጨረር መከላከያ መነፀር | Radiation-protection glasses | equipment | piece | Annex 1 (አባሪ 1) #27 |
| D173-A1-28 | የኬሚካል መከላከያ መነፀር | Chemical-protection glasses | equipment | piece | Annex 1 (አባሪ 1) #28 |
| D173-A1-29 | ሴፍቲ መነፀር | Safety glasses | equipment | piece | Annex 1 (አባሪ 1) #29 |
| D173-A1-30 | ማስክ (አፍና አፍንጫ መሸፈኛ) | Mask (mouth and nose cover) | equipment | piece | Annex 1 (አባሪ 1) #30 |
| D173-A1-31 | አይነ-ርግብ | Eye shield / goggles (አይነ-ርግብ) | equipment | piece | Annex 1 (አባሪ 1) #31 |
| D173-A3-05 | የብረት ወይም ማይካ ወይም ፕላስቲክ ቆብ | Metal, "mica" or plastic helmet | equipment | piece | Annex 3 (አባሪ 3) group 6 |
| D173-A3-09 | የጨረር መከላከያ ወይም ሴፍቲ መነፀር | Radiation-protection or safety glasses | equipment | piece | Annex 3 (አባሪ 3) group 10 |

### Fire-fighting / የእሳት አደጋ (6)

| Code | Amharic (as printed) | English | Kind | Unit | Source |
|---|---|---|---|---|---|
| D173-A1-36 | የተቋሙ ቋሚ ንብረት ሆኖ የእሳት አዳጋን ሊከላከል የሚችል ጃኬትና ሱሪ | Fire-protective jacket and trousers (permanent property of the institution) | clothing | piece | Annex 1 (አባሪ 1) #36 · Annex 2 #15 |
| D173-A1-38 | የእሳት አዳጋ መከላከያ የአንገት መከላከያ ልብስ | Fire-protection neck-protection garment | clothing | piece | Annex 1 (አባሪ 1) #38 |
| D173-A1-39 | የተቋሙ ቋሚ ንብረት ሆኖ የእሳት አዳጋ የመተንፈሻ መሳሪያ | Fire-fighting breathing apparatus (permanent property of the institution) | equipment | piece | Annex 1 (አባሪ 1) #39 |
| D173-A1-40 | ለእሳት አዳጋ የሚያገለግል የጆሮ መሸፈኛ | Fire-fighting ear cover | clothing | piece | Annex 1 (አባሪ 1) #40 |
| D173-A1-41 | ለእሳት አደጋ የሚያገለግል ብርድ ልብስ | Fire-fighting blanket | equipment | piece | Annex 1 (አባሪ 1) #41 |
| D173-A1-42 | ለእሳት አደጋ የሚያገለግል አብረቅራቂ ቱታ | Reflective coverall for fire-fighting | clothing | pair | Annex 1 (አባሪ 1) #42 · Annex 2 #14 |

### Work tools / የሥራ መሣሪያ (9)

| Code | Amharic (as printed) | English | Kind | Unit | Source |
|---|---|---|---|---|---|
| D173-EQ-01 | መነጽር | Glasses | equipment | piece | Art. 2(4) |
| D173-EQ-02 | ጠመንጃ | Gun (rifle) | equipment | piece | Art. 2(4) |
| D173-EQ-03 | ማጭድ | Sickle | equipment | piece | Art. 2(4) |
| D173-EQ-04 | የአይን መሸፈኛ ጎግል | Goggles (eye cover) | equipment | piece | Art. 2(4) |
| D173-EQ-05 | የአፍ መሸፈኛ ፊልተር | Mouth-cover filter (respirator filter) | equipment | piece | Art. 2(4) |
| D173-EQ-06 | አካፋ | Shovel | equipment | piece | Art. 2(4) |
| D173-EQ-07 | መዶሻ | Hammer | equipment | piece | Art. 2(4) |
| D173-EQ-08 | መርቴሎ | Mallet / sledgehammer (መርቴሎ) | equipment | piece | Art. 2(4) |
| D173-EQ-09 | የአትክልት መቀስ | Garden shears | equipment | piece | Art. 2(4) |

Counts: Annex 1 — 43 items; Annex 2 — 16 listed, of which **#14 and #15 are the same garments as Annex 1 #42 and #36** and are recorded on those items instead of being duplicated (14 new items); wording printed only in Annex 3 — 9; Articles 2 and 5 — 7; work equipment named in Art. 2(4) — 9. Total 82.

Near-duplicates that were **kept apart on purpose** because the printed wording differs: the gloves (Annex 1 #18/#19/#20/#37 and the "either/or" gloves in Annex 3), the leather-like plastic coat sets (Annex 2 #12/#13 and the combined Annex 3 line), and the equipment named in Art. 2(4) versus the similar Annex 1 items (e.g. "መነጽር" and "ጎግል" versus the glasses/goggles types). HR may merge them.

## Annex 3 — entitlements per job position (480 rows)

Units of the printed quantity: *በዓመት* = per budget year; *በየ3 ዓመቱ* = one every 36 months; *በየ2 ዓመቱ* = one every 24 months; *የመጀመሪያው ዓመት ሁለት ተሰጥቶ በየዓመቱ አንድ* = first year 2, then 1 per year. The printed wording is stored with every row.

### ተ.ቁ 1 (PDF p.24) — active

**Positions:** የጥበቃ ሰራተኛ; ጥበቃና አትክልተኛ; የዘብ ኃላፊ; ጥበቃ ተቆጣጣሪ; ጥበቃ ሰራተኛ ሃላፊ

| Item | Printed quantity | Stored as | Only for / except |
|---|---|---|---|
| ለወንድ ኮትና ሱሪ (Men's coat and trousers (tailored)) | በዓመት ሁለት | 2 per year |  |
| ለሴት ጃኬትና ጉርድ ቀሚስ (Women's jacket and straight skirt (tailored)) | በዓመት አንድ | 1 per year |  |
| ለሴት አንድ ወጥ ሸሚዝና ሱሪ (Women's matching shirt and trousers (tailored)) | በዓመት አንድ | 1 per year |  |
| ሸሚዝ (Shirt) | በዓመት ሁለት | 2 per year |  |
| አጭር ቆዳ ጫማ ከቆዳ የተሰራ (Short leather shoes) | በዓመት ሁለት ጥንድ | 2 per year |  |
| ካፖርት (ባለገበር) (Overcoat (with lining)) | በመጀመሪያ አንድ ተሰጥቶ በየ3 ዓመቱ አንድ | 1 every 36 months |  |
| የፕላስቲክ ቡትስ ጫማ ባለገበር (Rubber/plastic boots (with lining)) | በዓመት አንድ ጥንድ | 1 per year |  |
| ለቱታ (Coverall (tailored)) | በዓመት አንድ | 1 per year | only: ጥበቃና አትክልተኛ |
| የዝናብ ልብስ (Rain clothing) | በመጀመሪያ አንድ ተሰጥቶ በየ3 ዓመቱ አንድ | 1 every 36 months |  |

### ተ.ቁ 2 (PDF p.24) — active

**Positions:** የከተማ አረንጓዴ ቦታዎች ልማት እንክብካቤ ሰራተኛ/ተቆጣጣሪ; አትክልተኛ; ግቢ ጽዳትና ውበት ባለሙያ/ሰራተኛ; ለምድረ ግቢ ጽዳትና ውበት እንክብካቤ ባለሙያ ሰራተኛ; የግቢ ውበት ባለሙያ; ለጋርደኒግ ባለሙያ/ሰራተኛ; ለከተማ ጽዳትና ውበት ባለሙያ/ሰራተኛ; ለከተማ ጽዳትና ውበት ባለሙያ/ተቆጣጣሪ/ ሰራተኛ; ችግኝ ጣቢያ ሠራተኛ; ግሪን ሃውስ ሰራተኛ; ችግኝ ጣቢያ ቴክኒሻን

| Item | Printed quantity | Stored as | Only for / except |
|---|---|---|---|
| ለቱታ (Coverall (tailored)) | በዓመት አንድ | 1 per year |  |
| አጭር ቆዳ ጫማ ከቆዳ የተሰራ (Short leather shoes) | በዓመት ሁለት ጥንድ | 2 per year |  |
| የፕላስቲክ ቡትስ ጫማ ባለገበር (Rubber/plastic boots (with lining)) | በዓመት አንድ ጥንድ | 1 per year |  |

### ተ.ቁ 3 (PDF p.24) — active

**Positions:** የጽዳት ተቆጣጣሪ; የጽዳት ሠራተኛ; የቲሹካልቸር ላብራቶሪ ክፍሎች ፅዳት ሰራተኛ; የቲሹካልቸር ላብራቶሪ ብርጭቆ አጣቢ ሰራተኛ; የንጽህና አያያዝና አጠባበቅ; የንጽህና አያያዝና አጠባበቅ ሰራተኛ; ፅዳትና ተላላኪ ሰራተኛ; ፅዳት ሰራተኛና ተላላኪ; ተላላኪ; ደብዳቤ ላኪና ተቀባይ; ጉዳይ አስፈፃሚ; መጥሪያ አዳይ; ጉዳይ ክትትል ሰራተኛ; እግረኛ ፖስተኛ

| Item | Printed quantity | Stored as | Only for / except |
|---|---|---|---|
| ለወንድ ኮትና ሱሪ (Men's coat and trousers (tailored)) | በዓመት ሁለት | 2 per year |  |
| ለሴት ጃኬትና ጉርድ ቀሚስ (Women's jacket and straight skirt (tailored)) | በዓመት አንድ | 1 per year |  |
| ለሴት አንድ ወጥ ሸሚዝና ሱሪ (Women's matching shirt and trousers (tailored)) | በዓመት አንድ | 1 per year |  |
| ሸሚዝ (Shirt) | በዓመት ሁለት | 2 per year |  |
| አጭር ቆዳ ጫማ ከቆዳ የተሰራ (Short leather shoes) | በዓመት ሁለት ጥንድ | 2 per year |  |
| ለሙሉ ሽርጥ (Full apron (tailored)) | በዓመት ሁለት | 2 per year | only: የጽዳት ሠራተኛ; የቲሹካልቸር ላብራቶሪ ክፍሎች ፅዳት ሰራተኛ; የንጽህና አያያዝና አጠባበቅ ሰራተኛ; ፅዳትና ተላላኪ ሰራተኛ; ፅዳት ሰራተኛና ተላላኪ |
| ከጨርቅ የተሰራ የፀጉር መሸፈኛ ቆብ (Fabric hair-covering cap) | በዓመት ሁለት | 2 per year | only: የቲሹካልቸር ላብራቶሪ ክፍሎች ፅዳት ሰራተኛ; የቲሹካልቸር ላብራቶሪ ብርጭቆ አጣቢ ሰራተኛ; የንጽህና አያያዝና አጠባበቅ ሰራተኛ; ፅዳትና ተላላኪ ሰራተኛ; ፅዳት ሰራተኛና ተላላኪ |
| የእጅ ጓንት (Gloves (material not specified)) | በዓመት ሁለት ጥንድ | 2 per year | only: የጽዳት ሠራተኛ; የቲሹካልቸር ላብራቶሪ ክፍሎች ፅዳት ሰራተኛ; የንጽህና አያያዝና አጠባበቅ ሰራተኛ; ፅዳትና ተላላኪ ሰራተኛ; ፅዳት ሰራተኛና ተላላኪ |
| ጃንጥላ (Umbrella) | በአመት አንድ | 1 per year | only: ጉዳይ አስፈፃሚ; መጥሪያ አዳይ; ጉዳይ ክትትል ሰራተኛ; እግረኛ ፖስተኛ |

### ተ.ቁ 4 (PDF p.25) — INACTIVE

*ለርዕሰ መስተዳድር፣ ለዋና አፈጉባኤ፣ ምክትል ርዕሰ መስተዳድር እና አቻ ለሆኑ ብቻ (for the Regional President, Speaker, Deputy President and equivalents only)*

**Positions:** ልዩ ጥበቃ; ፕሮቶኮል ሹፌር; ፕሮቶኮል ባለሙያ

| Item | Printed quantity | Stored as | Only for / except |
|---|---|---|---|
| ሱፍ ኮትና ሱሪ (ጥራቱን የጠበቀ የሃገር ውስጥ ምርት) (Wool-blend suit, coat and trousers (quality local product)) | የመጀመሪያው ዓመት ሁለት ተሰጥቶ በየዓመቱ አንድ የሚሰጥ | 2 in the first year, then 1 per year |  |
| አጭር ቆዳ ጫማ ከቆዳ የተሰራ (Short leather shoes) | በዓመት ሁለት ጥንድ | 2 per year |  |
| ሸሚዝ (Shirt) | በዓመት ሁለት | 2 per year |  |
| ክራባት (Necktie) | በመጀመሪያው ዓመት ሁለት ተሰጥቶ በየዓመቱ አንድ | 2 in the first year, then 1 per year |  |
| ለቱታ (Coverall (tailored)) | በዓመት አንድ | 1 per year | only: ፕሮቶኮል ሹፌር |

### ተ.ቁ 5 (PDF p.25) — INACTIVE

*ለካቢኒ ጉዳዮችና የርዕሰ መስተዳድር ጽ/ቤት ብቻ (for Cabinet Affairs and the Regional President's Office only)*

**Positions:** የካቢኒ ጉዳዮች ሴክሬታሪያት ዳይሬክተር እና የካቢኒ ሴክሬታሪያት ባለሙያ; አስጎብኛ ባለሙያ

| Item | Printed quantity | Stored as | Only for / except |
|---|---|---|---|
| ሱፍ ኮትና ሱሪ (ጥራቱን የጠበቀ የሃገር ውስጥ ምርት) (Wool-blend suit, coat and trousers (quality local product)) | የመጀመሪያው ዓመት ሁለት ተሰጥቶ በየዓመቱ አንድ የሚሰጥ | 2 in the first year, then 1 per year |  |
| አጭር ቆዳ ጫማ ከቆዳ የተሰራ (Short leather shoes) | በዓመት ሁለት ጥንድ | 2 per year |  |
| ሸሚዝ (Shirt) | በዓመት ሁለት | 2 per year |  |
| ክራባት (Necktie) | በመጀመሪያው ዓመት ሁለት ተሰጥቶ በየዓመቱ አንድ | 2 in the first year, then 1 per year |  |

### ተ.ቁ 6 (PDF p.25) — active

**Positions:** ሞተረኛ ፖስተኛ

| Item | Printed quantity | Stored as | Only for / except |
|---|---|---|---|
| ቆዳ መሰል የላስቲክ ኮትና ሱሪ ወይም ጃኬትና ሱሪ/ቀሚስ (Leather-like plastic coat and trousers, or jacket and trousers/dress) | በዓመት አንድ | 1 per year |  |
| ሸሚዝ (Shirt) | በዓመት ሁለት | 2 per year |  |
| አጭር ቆዳ ጫማ ከቆዳ የተሰራ (Short leather shoes) | በዓመት ሁለት ጥንድ | 2 per year |  |
| የዝናብ ልብስ (Rain clothing) | በመጀመሪያ አንድ ተሰጥቶ በ3 ዓመት አንድ | 1 every 36 months |  |
| የብረት ወይም ማይካ ወይም ፕላስቲክ ቆብ (Metal, "mica" or plastic helmet) | በመጀመሪያ አንድ ተሰጥቶ በ3 ዓመት አንድ | 1 every 36 months |  |
| የእጅ ጓንት ከሽራ የተሰራ (Gloves made of cloth (ሽራ)) | በዓመት ሁለት | 2 per year |  |

### ተ.ቁ 7 (PDF p.25) — active

**Positions:** ሹፌር; የባለሶስት እግር ተሽከርካሪ ሹፌር (ባጃጅ); አምቡላንስ ሹፌር; ጎሚስታ ሠራተኛ; ጎሚስታ; የልዩ ተሽከርካሪ ሹፌር; የልዩ ተሽከርካሪ ሹፌር ረዳት; የከባድ መኪና ሹፌር; የከባድ መኪና ሹፌር ረዳት; ረዳት የትራክተር ኦፐሬተር; ሹፌር ረዳት; ረዳት ኤክስካባተር ኦፐሬተር; ረዳት ዶዘር ኦፐሬተር; ረዳት ግሬደር ኦፐሬተር; ረዳት ሎደር ኦፐሬተር; ረዳት ሮለር ኦፐሬተር; ረዳት ሎቬድ ኦፐሬተር; ረዳት ክሬን ኦፐሬተር

| Item | Printed quantity | Stored as | Only for / except |
|---|---|---|---|
| ኮትና ሱሪ (Coat and trousers (as printed for drivers and assistants)) | በዓመት አንድ | 1 per year |  |
| ለቱታ (Coverall (tailored)) | በዓመት ሁለት | 2 per year |  |
| ሸሚዝ (Shirt) | በዓመት ሁለት | 2 per year |  |
| አጭር ቆዳ ጫማ ከቆዳ የተሰራ (Short leather shoes) | በዓመት ሁለት ጥንድ | 2 per year |  |
| የፕላስቲክ ቡትስ ጫማ ባለገበር (Rubber/plastic boots (with lining)) | በዓመት አንድ ጥንድ | 1 per year | except: ሹፌር; የባለሶስት እግር ተሽከርካሪ ሹፌር (ባጃጅ); አምቡላንስ ሹፌር |
| የላስቲክ ሽርጥ (አፕሮን) (Plastic apron) | በዓመት ሁለት | 2 per year | except: ሹፌር; የባለሶስት እግር ተሽከርካሪ ሹፌር (ባጃጅ); አምቡላንስ ሹፌር |
| የእጅ ጓንት ከሽራ ወይም ከፕላስቲክ የተሰራ (Gloves of cloth (ሽራ) or plastic) | በዓመት ሁለት ጥንድ | 2 per year | except: ሹፌር; የባለሶስት እግር ተሽከርካሪ ሹፌር (ባጃጅ); አምቡላንስ ሹፌር |

### ተ.ቁ 8 (PDF p.26) — active

**Positions:** ሁለገብ ጥገና ሠራተኛ; ትራክተር ኦፐሬተር; ኤክስካባተር ኦፐሬተር; ዶዘር ኦፐሬተር; ግሬደር ኦፐሬተር; ሎደር ኦፐሬተር; ሮለር ኦፐሬተር; ሎቬድ ኦፐሬተር; ክሬን ኦፐሬተር; ፎርክ ሊፍት; ክሬቸር ኦፐሬተር; ክሬን ትራክ ሹፌር; ሪግ ኦፐሬተር; ማሽን ኦፐሬተር; ረዳት ማሽን ኦፐሬተር; መለስተኛ ማሽን ኦፐሬተር; ማሽን ቁጥጥርና ጥገና ባለሙያ/ሰራተኛ; ከፍተኛ ማሽኒስት; ማሽኒስት; የእንጨት ሥራ ቴክኒሺያን/ባለሙያ; የእንጨት ሠራተኛ; ብረታብረት ቴክኒሻን; ቀለም ቀቢ

| Item | Printed quantity | Stored as | Only for / except |
|---|---|---|---|
| ለቱታ (Coverall (tailored)) | በዓመት ሁለት | 2 per year |  |
| አጭር ቆዳ ጫማ ከቆዳ የተሰራ (Short leather shoes) | በዓመት አንድ ጥንድ | 1 per year |  |
| ሴፍቲ ቆዳ ጫማ ከቆዳ የተሰራ (Safety leather shoes) | በመጀመሪያ አንድ ተሰጥቶ በየ2 ዓመቱ አንድ | 1 every 24 months |  |
| ለጨርቅ ቆብ (Fabric cap (tailored)) | በዓመት አንድ | 1 per year |  |
| የእጅ ጓንት ከሽራ ወይም ከፕላስቲክ የተሰራ (Gloves of cloth (ሽራ) or plastic) | በዓመት ሁለት ጥንድ | 2 per year |  |

### ተ.ቁ 9 (PDF p.26) — active

**Positions:** የቅባት፣ ነዳጅና ዘይት አዳይ /የተሽከረካሪ/

| Item | Printed quantity | Stored as | Only for / except |
|---|---|---|---|
| ለቱታ (Coverall (tailored)) | በዓመት ሁለት | 2 per year |  |
| አጭር ቆዳ ጫማ ከቆዳ የተሰራ (Short leather shoes) | በዓመት ሁለት ጥንድ | 2 per year |  |
| የእጅ ጓንት ፕላስቲክ የተሰራ (Gloves made of plastic) | በዓመት ሁለት ጥንድ | 2 per year |  |

### ተ.ቁ 10 (PDF p.26) — active

*Page 27 continues this position list but that part of the scan is smudged and unreadable, so those positions are NOT imported (only fragments such as "መካኒክ", "ረዳት የምርት ሠራተኛ", "ቀለም ቀቢ" are visible).*

*Immediate eligibility: Garage work: Art. 7(2) entitles garage workers from the date of assignment (no six-month wait). Group confirmed as garage positions from their titles; HR to confirm.*

**Positions:** የትራንስፖርት ሥምሪት ጋራዥ ክፍል ኃላፊ; የጋራዥ ጥገና ኃላፊ; የጋራዥ ኃላፊ/ባለሙያ/ሠራተኛ; መካኒክ; ረዳት መካኒክ; ቀጥቃጭ; የአውቶ ኤሌክትሪሺያን; የጥገና ሠራተኛና; በያጅ; ብረታብረት ሠራተኛ

| Item | Printed quantity | Stored as | Only for / except |
|---|---|---|---|
| ለቱታ (Coverall (tailored)) | በዓመት ሁለት | 2 per year |  |
| ሴፍቲ ቆዳ ጫማ ከቆዳ የተሰራ (Safety leather shoes) | በመጀመሪያ አንድ ተሰጥቶ በየ2 ዓመቱ አንድ | 1 every 24 months |  |
| አጭር ቆዳ ጫማ ከቆዳ የተሰራ (Short leather shoes) | በዓመት አንድ ጥንድ | 1 per year |  |
| የእጅ ጓንት ከሽራ ወይም ከሌዘር የተሰራ (Gloves of cloth (ሽራ) or "leather" (ሌዘር)) | በዓመት ሁለት ጥንድ | 2 per year |  |
| የጨረር መከላከያ ወይም ሴፍቲ መነፀር (Radiation-protection or safety glasses) | በአመት አንድ | 1 per year |  |

### ተ.ቁ 11 (PDF p.27) — INACTIVE

*The position title of this row (ተ.ቁ 11) is faded and cannot be read in the scan (it ends "…ሠራተኛ"). The items below are legible. The row is stored INACTIVE under a placeholder title until HR reads the original and enters the correct title.*

**Positions:** [የሥራ መደብ መጠሪያ በስካኑ ላይ አይነበብም — ተ.ቁ 11]

| Item | Printed quantity | Stored as | Only for / except |
|---|---|---|---|
| ለቱታ (Coverall (tailored)) | በዓመት ሁለት | 2 per year |  |
| አጭር ቡትስ ቆዳ ጫማ ከቆዳ የተሰራ (Short leather boots (ankle boots)) | በዓመት አንድ ጥንድ | 1 per year |  |
| የፕላስቲክ ቡትስ ጫማ ባለገበር (Rubber/plastic boots (with lining)) | በዓመት አንድ ጥንድ | 1 per year |  |
| የላስቲክ ሽርጥ (አፕሮን) (Plastic apron) | በዓመት ሶስት | 3 per year |  |
| የላስቲክ ጓንት (Rubber/plastic gloves) | በዓመት ሶስት ጥንድ | 3 per year |  |

## Interpretations HR should confirm
1. **Group 7 exception** — rubber boots, plastic apron and gloves are given to the group *"ከሾፌር፣ የባለሶስት እግር ተሽከርካሪ (ባጃጅ) ሾፌር፣ አምቡላንስ ሾፌር ውጭ ሌሎች"* (others than driver, three-wheeler driver and ambulance driver). Loaded literally: only those three titles are excluded. If "ሾፌር" is meant to cover every driver title (special-vehicle, heavy-truck), exclude those rows too.
2. **"ሴፍቲ ሹዝ"** in Annex 3 is mapped to Annex 1 #10 (ሴፍቲ ቆዳ ጫማ, safety leather shoes).
3. **Immediate eligibility (Art. 7(2))** is set only for group 10, which is the garage group by its titles. Chemical, health and fire-fighting positions are not in pages 24–27. Everyone else waits the configured period (six months).
4. **Gender-specific lines** (coat and trousers for men; jacket and skirt, or matching shirt and trousers, for women) are both listed for the position, as printed. HR issues the one that applies.
5. **Group 3 restrictions** (apron, cap, gloves, umbrella) are applied to the named positions only. The directive names them loosely (e.g. "ለፅዳትና ተላላኪ"); they were matched to the closest position in the same group.
6. **Groups 4 and 5** apply only to the Regional President, Speaker, Deputy President and equivalents (group 4) and to Cabinet Affairs / the President's Office (group 5). They are stored **inactive**.
7. **Position titles** are stored exactly as printed (including "የጥገና ሠራተኛና" and "በያጅ" in group 10). An entitlement matches an employee when the printed title equals the title of the employee's position in the HRMS (a `%` wildcard is allowed). **Titles in the College's own position list may differ**; HR adjusts the title on the entitlement row or the position.
8. **English names** are accurate translations of the Amharic where the meaning is clear. Four are marked *verify* in the item note: "አይነ-ርግብ", "አበነብስ" (three items) and "ሽራ"/"ሌዘር" are kept as printed.
9. **Fiscal year** for the yearly quantities defaults to July–June (Gregorian) as a display default; pass the budget year explicitly if the College's differs.

## What could NOT be read or loaded (not guessed)
* **Page 27, top:** the rest of group 10's position list is smudged in the scan. Only fragments are legible ("መካኒክ", "ሁለገብ ረዳት የምርት…", "ረዳት የምርት ሠራተኛ", "…ቀለም ቀቢ"); these positions are **not imported**.
* **Page 27, group 11:** the position title is faded and unreadable; its five legible items are stored **inactive** under the placeholder title *[የሥራ መደብ መጠሪያ በስካኑ ላይ አይነበብም — ተ.ቁ 11]*. HR must read the original, set the correct title and activate the rows. The last line of group 11 (mask, "እንደ ሥራ መሣሪያ የሚሰጥ" = given as work equipment) has **no stated quantity** and is not loaded as an entitlement; the mask exists as an item (Annex 1 #30).
* **Pages after 27:** Annex 3 may continue beyond page 27 (outside the requested range); nothing from those pages was read.
* **Not modelled** (stated in Articles 7–8, already in the rules register): the Tahsas 30 deadline, the purchase committee, the cash tailoring allowance and price ceilings, the acting-staff rule.

## Behaviour added to issuing
* **Rolling periods**: an entitlement with a period (36/24 months) counts what was issued in that window; without a period it counts within the budget year (unissued quantities do not carry over, Art. 7(10)).
* **First-year allowance**: where the printed rule is "first year two, then one per year", the larger quantity applies only if the employee had no issue of that item in an earlier year.
* **Immediate eligibility** is now also an attribute of an entitlement (not only of an item).
* The **Issue** tab lets HR pick any catalogue item (grouped by category). The system shows the entitlement and what remains, and still refuses an item with no entitlement for the employee's job title, no stock, or an unfinished waiting period.
