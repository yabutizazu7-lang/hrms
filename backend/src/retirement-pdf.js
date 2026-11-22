// Retirement Letter (የጡረታ ደብዳቤ) as a real PDF. Same fonts, frame and layout engine as the Work Experience Certificate.
// Everything printed comes from the snapshot saved with the letter (employee database + the approved retirement case); nothing is invented.
const PDFDocument = require('pdfkit'), path = require('path'), C = require('./certificate-pdf');
const FONTS = path.join(__dirname, '../assets/fonts');
const L = {
  title: ['የጡረታ ደብዳቤ', 'RETIREMENT LETTER'], ref: ['የማመሳከሪያ ቁጥር', 'Reference No.'], date: ['ቀን', 'Date'], toWhom: ['ለሚመለከተው ሁሉ', 'To whom it may concern'],
  info: ['የሠራተኛው መረጃ', 'Employee information'], name: ['ሙሉ ስም', 'Full name'], id: ['የሠራተኛ መታወቂያ ቁጥር', 'Employee ID'], sex: ['ፆታ', 'Gender'], dob: ['የትውልድ ቀን', 'Date of birth'], job: ['የሥራ መደብ', 'Job position'], dept: ['ክፍል', 'Department'],
  start: ['የቅጥር መጀመሪያ ቀን', 'Employment start date'], age: ['የጡረታ ዕድሜ', 'Retirement age'], official: ['ይፋዊ የጡረታ ቀን', 'Official retirement date'], total: ['ጠቅላላ የአገልግሎት ዘመን', 'Total service'], remarks: ['ማስታወሻ', 'Remarks'],
  male: ['ወንድ', 'Male'], female: ['ሴት', 'Female'], years: ['ዓመት', 'year(s)'], months: ['ወር', 'month(s)'], and: ['እና', 'and'],
  sign: ['የሰው ኃይል ሥራ አስኪያጅ ፊርማ', 'HR Manager signature'], stamp: ['ማኅተም', 'Official stamp'],
  verify: ['ይህ ደብዳቤ በሰው ኃይል ሥራ አስኪያጁ ፊርማና በተቋሙ ማኅተም ሲረጋገጥ ብቻ ዋጋ አለው።', 'This letter is valid only when confirmed by the signature of the HR Manager and the official stamp of the institution.'],
};
function build({ snap, ref, issueDate, approver, signature, stamp, language }) {
  const lang = ['am', 'en', 'both'].includes(language) ? language : 'am', dual = lang === 'both';
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 56, right: 56 }, info: { Title: `${L.title[1]} - ${snap.employee.full_name}`, Author: snap.organization.name, Subject: ref, Creator: 'HRMS' } });
  const bufs = []; doc.on('data', (b) => bufs.push(b)); const done = new Promise((res, rej) => { doc.on('end', () => res(Buffer.concat(bufs))); doc.on('error', rej); });
  for (const [k, f] of Object.entries({ 'eth-r': 'NotoSansEthiopic-Regular.ttf', 'eth-b': 'NotoSansEthiopic-Bold.ttf', 'lat-r': 'NotoSans-Regular.ttf', 'lat-b': 'NotoSans-Bold.ttf' })) doc.registerFont(k, path.join(FONTS, f));
  const W = doc.page.width - 112, X0 = 56, ACCENT = '#0e6b8a', MUTED = '#555', text = C.makeText(doc, dual, W, '#1b1b1b');
  const pick = (p) => (lang === 'am' ? p[0] : lang === 'en' ? p[1] : `${p[0]} / ${p[1]}`), gapY = (n) => { doc.y += n; doc.x = X0; };
  const rule = (c = '#c9d3d8', w = 0.8) => { doc.moveTo(X0, doc.y).lineTo(X0 + W, doc.y).lineWidth(w).strokeColor(c).stroke(); };
  doc.rect(28, 28, doc.page.width - 56, doc.page.height - 56).lineWidth(1.4).strokeColor(ACCENT).stroke(); doc.rect(33, 33, doc.page.width - 66, doc.page.height - 66).lineWidth(0.4).strokeColor(ACCENT).stroke();
  const o = snap.organization, orgAm = o.name_am || o.name, orgEn = o.name, e = snap.employee, j = snap.job, em = snap.employment, rt = snap.retirement;
  const lp = C.logoPath(); doc.y = 48; if (lp) { try { const ls = dual ? 52 : 64; doc.image(lp, doc.page.width / 2 - ls / 2, doc.y, { fit: [ls, ls] }); doc.y += ls + 6; } catch { /* header without logo */ } }
  const orgLine = lang === 'am' ? orgAm : lang === 'en' ? orgEn : orgAm === orgEn ? orgEn : null;
  if (orgLine) text(orgLine, { size: 15, bold: true, align: 'center', color: ACCENT }); else { text(orgAm, { size: 14, bold: true, align: 'center', color: ACCENT, lineGap: 0 }); text(orgEn, { size: 12, bold: true, align: 'center', color: ACCENT }); }
  gapY(2); rule(ACCENT, 1.2); gapY(10);
  if (dual) { text(L.title[0], { size: 19, bold: true, align: 'center', lineGap: 0 }); text(L.title[1], { size: 13, bold: true, align: 'center', color: MUTED }); } else text(pick(L.title), { size: lang === 'am' ? 20 : 17, bold: true, align: 'center' });
  gapY(8);
  const y0 = doc.y, dtxt = [lang !== 'en' && C.dateAm(issueDate), lang !== 'am' && C.dateEn(issueDate)].filter(Boolean).join('  |  ');
  const a = text(`${pick(L.ref)}: ${ref}`, { size: 9.5, color: MUTED, width: W / 2 - 4, x: X0, y: y0 }), b = text(`${pick(L.date)}: ${dtxt}`, { size: 9.5, color: MUTED, width: W / 2 + 40, x: X0 + W / 2 - 40, y: y0, align: 'right' }); doc.y = Math.max(a, b) + 4; doc.x = X0;
  text(pick(L.toWhom), { size: 11, bold: true }); gapY(4);
  const nameAm = e.name_am || e.full_name, nameEn = e.name_en || e.full_name, titleAm = j.title_am || j.title || '—', titleEn = j.title || j.title_am || '—';
  const dur = (l) => { const i = l === 'am' ? 0 : 1, p = []; if (em.service.years) p.push(`${em.service.years} ${L.years[i]}`); if (em.service.months) p.push(`${em.service.months} ${L.months[i]}`); if (!p.length) return `0 ${L.months[i]}`; return l === 'am' ? p.join(' ከ') : p.join(` ${L.and[1]} `); };
  const d = (iso, l) => (l === 'am' ? C.dateAm(iso) : C.dateEn(iso));
  const para = (l) => l === 'am'
    ? `ይህ ደብዳቤ የተሰጠው ለ${nameAm} (የሠራተኛ መታወቂያ ቁጥር ${e.employee_no}) ሲሆን፣ ከ${d(em.start_date, 'am')} ጀምሮ በ${orgAm} በ${titleAm} የሥራ መደብ${j.department ? ` በ${j.department} ክፍል` : ''} ሲያገለግሉ የቆዩ መሆናቸውን፣ የጡረታ ዕድሜ (${rt.age} ዓመት) በመድረሳቸው (የትውልድ ቀን ${d(e.date_of_birth, 'am')}) በተቋሙ የሰው ኃይል ሥራ አስኪያጅ ውሳኔ መሠረት ከ${d(rt.official_date, 'am')} ጀምሮ በጡረታ የተሰናበቱ መሆናቸውን ያረጋግጣል። ጠቅላላ የአገልግሎት ዘመናቸው ${dur('am')} ነው።`
    : `This is to certify that ${nameEn} (Employee ID ${e.employee_no}) served ${orgEn} as ${titleEn}${j.department ? ` in the ${j.department} department` : ''} from ${d(em.start_date, 'en')}, and, having reached the retirement age of ${rt.age} years (date of birth ${d(e.date_of_birth, 'en')}), retired from service with effect from ${d(rt.official_date, 'en')}, in accordance with the decision of the HR Manager of the institution. The total length of service is ${dur('en')}.`;
  for (const l of dual ? ['am', 'en'] : [lang]) { text(para(l), { size: 10.5, align: 'justify' }); gapY(4); }
  gapY(4); text(pick(L.info), { size: 11.5, bold: true, color: ACCENT }); rule(); gapY(5);
  const row = (k, v, bold) => { const y = doc.y, x = text(pick(k), { size: 9.5, color: MUTED, width: 175, x: X0 + 8, y }), z = text(v, { size: 10.5, bold, width: W - 195, x: X0 + 190, y }); doc.y = Math.max(x, z) + 1; doc.x = X0; };
  const both = (x, y) => (lang === 'both' ? (x === y ? x : `${x} / ${y}`) : lang === 'am' ? x : y), dd = (iso) => (lang === 'en' ? C.dateEn(iso) : lang === 'am' ? C.dateAm(iso) : `${C.dateAm(iso)}  /  ${C.dateEn(iso)}`);
  row(L.name, both(nameAm, nameEn), true); row(L.id, e.employee_no, true); row(L.sex, pick(L[e.sex] || ['—', '—'])); row(L.dob, dd(e.date_of_birth)); row(L.job, both(titleAm, titleEn)); row(L.dept, j.department || '—'); row(L.start, dd(em.start_date));
  row(L.age, String(rt.age)); row(L.official, dd(rt.official_date), true); row(L.total, lang === 'both' ? `${dur('am')}  /  ${dur('en')}` : dur(lang));
  if (rt.remarks) row(L.remarks, rt.remarks);
  const BLOCK = 150, top = doc.page.height - 44 - BLOCK, colW = (W - 30) / 2, sx = X0, tx = X0 + colW + 30; if (doc.y > top - 6) { doc.addPage(); }
  doc.save().lineWidth(0.8).strokeColor('#8fa3ab').moveTo(sx + 8, top + 70).lineTo(sx + colW - 8, top + 70).stroke().restore(); doc.save().lineWidth(0.8).strokeColor('#8fa3ab').dash(3, { space: 3 }).circle(tx + colW / 2, top + 42, 44).stroke().undash().restore();
  if (signature) { try { doc.image(signature, sx + 24, top + 8, { fit: [colW - 48, 60], align: 'center', valign: 'bottom' }); } catch { /* empty area */ } }
  if (stamp) { try { doc.image(stamp, tx + colW / 2 - 42, top, { fit: [84, 84], align: 'center', valign: 'center' }); } catch { /* empty area */ } }
  text(pick(L.sign), { size: 9, color: MUTED, width: colW, x: sx, y: top + 74, align: 'center', lineGap: 0 });
  if (approver && approver.name) text(`${approver.name}${approver.title ? ' · ' + approver.title : ''}`, { size: 9.5, bold: true, width: colW, x: sx, y: top + 90, align: 'center', lineGap: 0 });
  text(pick(L.stamp), { size: 9, color: MUTED, width: colW, x: tx, y: top + 92, align: 'center' });
  doc.y = top + 118; doc.x = X0; rule(); gapY(4); text(pick(L.verify), { size: 8, color: MUTED, align: 'center', lineGap: 0 });
  doc.end(); return done;
}
module.exports = { build };
