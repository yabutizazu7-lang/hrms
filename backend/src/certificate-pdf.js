// Work Experience Certificate (የሥራ ልምድ ማስረጃ) as a real PDF, built with pdfkit.
// Everything printed comes from the certificate snapshot (read from the employee database) or from the signed-in HR authority; nothing is invented.
// Fonts: Noto Sans Ethiopic (Amharic) + Noto Sans (Latin, digits) in backend/assets/fonts (SIL Open Font License). A text run is drawn in the font that has its glyphs.
const PDFDocument = require('pdfkit'), fs = require('fs'), path = require('path');

const FONTS = path.join(__dirname, '../assets/fonts');
const LOGO_CANDIDATES = [process.env.CERT_LOGO_PATH, path.join(__dirname, '../assets/kpc-logo.jpg'), path.join(__dirname, '../../frontend/public/kpc-logo.jpg'), path.join(__dirname, '../../frontend/dist/kpc-logo.jpg')].filter(Boolean);
const logoPath = () => LOGO_CANDIDATES.find((p) => fs.existsSync(p)) || null;

// ---- Ethiopian calendar (same arithmetic as frontend/src/ethDate.js) -------------------------------------------------------------------------------
const EM_AM = ['መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት', 'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜን'];
const EM_EN = ['Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit', 'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'];
const GM_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const jdn = (y, m, d) => { const a = Math.floor((14 - m) / 12), y2 = y + 4800 - a, m2 = m + 12 * a - 3; return d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045; };
function ethiopian(iso) {   // 'YYYY-MM-DD' (Gregorian) -> { day, month (1-13), year } in the Ethiopian calendar
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso)); if (!m) return null;
  const j = jdn(+m[1], +m[2], +m[3]) - 1723856, r = j % 1461, n = (r % 365) + 365 * Math.floor(r / 1460);
  return { day: (n % 30) + 1, month: Math.floor(n / 30) + 1, year: 4 * Math.floor(j / 1461) + Math.floor(r / 365) - Math.floor(r / 1460) };
}
const dateAm = (iso) => { const e = ethiopian(iso); return e ? `${EM_AM[e.month - 1]} ${e.day} ቀን ${e.year} ዓ.ም` : ''; };
const dateEn = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${+m[3]} ${GM_EN[+m[2] - 1]} ${m[1]}` : ''; };
const dateEC = (iso) => { const e = ethiopian(iso); return e ? `${EM_EN[e.month - 1]} ${e.day}, ${e.year} E.C.` : ''; };

// ---- text helpers ---------------------------------------------------------------------------------------------------------------------------------
const ETH = /[\u1200-\u139F\u2D80-\u2DDF\uAB00-\uAB2F]/;
// split into runs of one script: the Ethiopic font has no digits / Latin letters / punctuation (only space and "-"), the Latin font has no Ethiopic
const runs = (s) => { const out = []; for (const ch of String(s ?? '')) { const neutral = ch === ' ' || ch === '-', k = ETH.test(ch) ? 'eth' : neutral ? null : 'lat', l = out[out.length - 1]; if (l && (k === null || l.k === k)) l.t += ch; else out.push({ k: k || 'lat', t: ch }); } return out; };

// the words of the certificate, in both languages (the choice of wording is the organisation's template, the facts are the snapshot)
const L = {
  title: ['የሥራ ልምድ ማስረጃ', 'WORK EXPERIENCE CERTIFICATE'], ref: ['የማመሳከሪያ ቁጥር', 'Reference No.'], date: ['ቀን', 'Date'], toWhom: ['ለሚመለከተው ሁሉ', 'To whom it may concern'],
  empInfo: ['የሠራተኛው መረጃ', 'Employee information'], name: ['ሙሉ ስም', 'Full name'], id: ['የሠራተኛ መታወቂያ ቁጥር', 'Employee ID'], job: ['የሥራ መደብ', 'Job title / position'], dept: ['ክፍል', 'Department'],
  start: ['የቅጥር መጀመሪያ ቀን', 'Employment start date'], end: ['የሥራ ማብቂያ ቀን', 'Employment end date'], present: ['እስካሁን በሥራ ላይ', 'Still employed (to date)'], total: ['ጠቅላላ የአገልግሎት ዘመን', 'Total service'],
  history: ['የቅጥር ታሪክ', 'Employment history'], hDate: ['ቀን', 'Date'], hEvent: ['ክስተት', 'Event'], hDetail: ['ዝርዝር', 'Details'], resp: ['የሥራ ኃላፊነቶች', 'Work responsibilities'],
  years: ['ዓመት', 'year(s)'], months: ['ወር', 'month(s)'], days: ['ቀን', 'day(s)'], and: ['እና', 'and'],
  sign: ['የሰው ኃይል ሥራ አስኪያጅ ፊርማ', 'HR Manager signature'], stamp: ['ማኅተም', 'Official stamp'], issuedBy: ['ያጸደቁት', 'Approved by'], draftMark: ['ረቂቅ – ገና አልተሰጠም', 'DRAFT – NOT YET ISSUED'],
  verify: ['ይህ ማስረጃ በሰው ኃይል ሥራ አስኪያጁ ፊርማና በተቋሙ ማኅተም ሲረጋገጥ ብቻ ዋጋ አለው።', 'This certificate is valid only when confirmed by the signature of the HR Manager and the official stamp of the institution.'],
  hired: ['ተቀጠሩ', 'Employed'], promotion: ['የደረጃ ዕድገት', 'Promotion'], transfer: ['ዝውውር', 'Transfer'],
};
const KIND = { hired: L.hired, promotion: L.promotion, transfer: L.transfer };

// mixed-script text layout (shared with the retirement letter): own line breaking, every run in the font that has its glyphs. Returns text(str, opts) -> y below the text
function makeText(doc, dual, W, INK) {
  const fontOf = (k, bold) => `${k === 'eth' ? 'eth' : 'lat'}-${bold ? 'b' : 'r'}`;
  const measure = (str, size, bold) => runs(str).reduce((w, r) => w + doc.font(fontOf(r.k, bold)).fontSize(size).widthOfString(r.t), 0);
  return (s, o = {}) => {
    const { size: sz = 11, bold = false, color = INK, align = 'left', width = W, x = doc.x, y = doc.y, lineGap = 3 } = o, size = sz * (dual ? 0.9 : 1), str = String(s ?? '').replace(/\s+/g, ' ').trim();
    if (!str) return y;
    const lh = size * 1.25 + lineGap, space = measure(' ', size, bold), words = str.split(' '), lines = []; let cur = [], curW = 0;
    for (const w of words) { const ww = measure(w, size, bold); if (cur.length && curW + space + ww > width) { lines.push({ words: cur, w: curW }); cur = [w]; curW = ww; } else { curW += (cur.length ? space : 0) + ww; cur.push(w); } }
    lines.push({ words: cur, w: curW });
    let ly = y; doc.fillColor(color);
    lines.forEach((ln, i) => {
      const justify = align === 'justify' && i < lines.length - 1 && ln.words.length > 1, gap = justify ? (width - (ln.w - space * (ln.words.length - 1))) / (ln.words.length - 1) : space;
      let cx = x + (align === 'center' ? (width - ln.w) / 2 : align === 'right' ? width - ln.w : 0);
      ln.words.forEach((w, wi) => { for (const r of runs(w)) { doc.font(fontOf(r.k, bold)).fontSize(size).text(r.t, cx, ly, { lineBreak: false }); cx += doc.widthOfString(r.t); } if (wi < ln.words.length - 1) cx += gap; });
      ly += lh;
    });
    doc.x = x; doc.y = ly; return ly;
  };
}

function build({ snap, status, issueDate, ref, approver, signature, stamp, language, draft }) {
  const lang = ['am', 'en', 'both'].includes(language) ? language : 'am', dual = lang === 'both';
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 56, right: 56 }, info: { Title: `${L.title[1]} - ${snap.employee.full_name}`, Author: snap.organization.name, Subject: ref, Creator: 'HRMS' } });
  const bufs = []; doc.on('data', (b) => bufs.push(b));
  const done = new Promise((res, rej) => { doc.on('end', () => res(Buffer.concat(bufs))); doc.on('error', rej); });
  const F = { 'eth-r': path.join(FONTS, 'NotoSansEthiopic-Regular.ttf'), 'eth-b': path.join(FONTS, 'NotoSansEthiopic-Bold.ttf'), 'lat-r': path.join(FONTS, 'NotoSans-Regular.ttf'), 'lat-b': path.join(FONTS, 'NotoSans-Bold.ttf') };
  for (const [k, p] of Object.entries(F)) doc.registerFont(k, p);
  const W = doc.page.width - 112, X0 = 56, ACCENT = '#0e6b8a', INK = '#1b1b1b', MUTED = '#555';

  // text(): draws a string whose parts may be Amharic and Latin. Own line layout: every word is measured run by run (each run in the font that has its glyphs),
  // lines are wrapped greedily and drawn fragment by fragment (pdfkit's "continued" text does not wrap mixed fonts reliably). Returns the y below the text.
  const text = makeText(doc, dual, W, INK);
  const pick = (pair) => (lang === 'am' ? pair[0] : lang === 'en' ? pair[1] : `${pair[0]} / ${pair[1]}`);
  const rule = (c = '#c9d3d8', w = 0.8) => { doc.moveTo(X0, doc.y).lineTo(X0 + W, doc.y).lineWidth(w).strokeColor(c).stroke(); };
  const orgAm = snap.organization.name_am || snap.organization.name, orgEn = snap.organization.name, orgLine = lang === 'am' ? orgAm : lang === 'en' ? orgEn : (orgAm === orgEn ? orgEn : null);

  // page frame (drawn on every page)
  const frame = () => { doc.save(); doc.rect(28, 28, doc.page.width - 56, doc.page.height - 56).lineWidth(1.4).strokeColor(ACCENT).stroke(); doc.rect(33, 33, doc.page.width - 66, doc.page.height - 66).lineWidth(0.4).strokeColor(ACCENT).stroke(); doc.restore(); };
  const watermark = () => { /* no DRAFT / ረቂቅ mark on the page (removed at the owner's request): the preview and the issued PDF look the same; the screen still says the preview is not valid until issued */ };
  const newPage = () => { doc.addPage(); frame(); watermark(); doc.x = X0; doc.y = 56; };
  frame();
  const room = (h) => { if (doc.y + h > doc.page.height - 48) newPage(); };
  const gapY = (n) => { doc.y += n; doc.x = X0; };
  const heading = (label) => { room(60); text(label, { size: 11.5, bold: true, color: ACCENT }); gapY(0); rule(); gapY(5); };

  // header: logo, organisation name, title
  const lp = logoPath(); doc.y = 48;
  if (lp) { try { const ls = dual ? 52 : 64; doc.image(lp, doc.page.width / 2 - ls / 2, doc.y, { fit: [ls, ls], align: 'center' }); doc.y += ls + 6; } catch { /* unreadable logo: header without it */ } }
  if (orgLine) text(orgLine, { size: 15, bold: true, align: 'center', color: ACCENT });
  else { text(orgAm, { size: 14, bold: true, align: 'center', color: ACCENT, lineGap: 0 }); text(orgEn, { size: 12, bold: true, align: 'center', color: ACCENT }); }
  gapY(2); rule(ACCENT, 1.2); gapY(10);
  if (dual) { text(L.title[0], { size: 19, bold: true, align: 'center', lineGap: 0 }); text(L.title[1], { size: 13, bold: true, align: 'center', color: MUTED }); }
  else text(pick(L.title), { size: lang === 'am' ? 20 : 17, bold: true, align: 'center' });
  gapY(8);

  // reference + date
  const y0 = doc.y, dtxt = issueDate ? [lang !== 'en' && dateAm(issueDate), lang !== 'am' && dateEn(issueDate), lang === 'en' && dateEC(issueDate)].filter(Boolean).join('  |  ') : '—';
  const yr = text(`${pick(L.ref)}: ${ref}`, { size: 9.5, color: MUTED, width: W / 2 - 4, x: X0, y: y0 }), yd = text(`${pick(L.date)}: ${dtxt}`, { size: 9.5, color: MUTED, width: W / 2 + 40, x: X0 + W / 2 - 40, y: y0, align: 'right' });
  doc.y = Math.max(yr, yd) + 4; doc.x = X0;
  text(pick(L.toWhom), { size: 11, bold: true }); gapY(4);

  // facts (all from the snapshot)
  const e = snap.employee, j = snap.job, em = snap.employment, svc = em.service;
  const nameAm = e.name_am || e.full_name, nameEn = e.name_en || e.full_name, titleAm = j.title_am || j.title, titleEn = j.title || j.title_am;
  const nm = (l) => (l === 'am' ? nameAm : nameEn), jt = (l) => (l === 'am' ? titleAm : titleEn) || '—';
  const dur = (l) => { const i = l === 'am' ? 0 : 1, p = []; if (svc.years) p.push(`${svc.years} ${L.years[i]}`); if (svc.months) p.push(`${svc.months} ${L.months[i]}`); if (svc.days) p.push(`${svc.days} ${L.days[i]}`); if (!p.length) return `0 ${L.months[i]}`; return l === 'am' ? p.join(' ከ') : p.length > 1 ? p.slice(0, -1).join(', ') + ' ' + L.and[1] + ' ' + p[p.length - 1] : p[0]; };
  const dfmt = (iso, l) => (iso ? (l === 'am' ? dateAm(iso) : dateEn(iso)) : '');
  const ended = !!em.end_date;
  const para = (l) => {
    if (l === 'am') return `ይህ የሥራ ልምድ ማስረጃ የተሰጠው ለ${nm('am')} (የሠራተኛ መታወቂያ ቁጥር ${e.employee_no}) ሲሆን፣ ከ${dfmt(em.start_date, 'am')} ጀምሮ ${ended ? `እስከ ${dfmt(em.end_date, 'am')} ድረስ` : 'እስከ ዛሬ ድረስ'} በ${orgAm} በ${jt('am')} የሥራ መደብ${j.department ? ` በ${j.department} ክፍል` : ''} ${ended ? 'ሲያገለግሉ መቆየታቸውን' : 'በማገልገል ላይ መሆናቸውን'} ያረጋግጣል። ጠቅላላ የአገልግሎት ዘመናቸው ${dur('am')} ነው። ይህ ማስረጃ በጥያቄያቸው መሠረት ተሰጥቷል።`;
    return `This is to certify that ${nm('en')} (Employee ID ${e.employee_no}) ${ended ? 'served' : 'has been serving'} ${orgEn} as ${jt('en')}${j.department ? ` in the ${j.department} department` : ''} from ${dfmt(em.start_date, 'en')} ${ended ? `to ${dfmt(em.end_date, 'en')}` : 'to date'}. The total length of service is ${dur('en')}. This certificate is issued at the employee's request.`;
  };
  for (const l of lang === 'both' ? ['am', 'en'] : [lang]) { text(para(l), { size: 10.5, align: 'justify' }); gapY(4); }
  gapY(4);

  // employee information table
  const row = (k, v, bold = false) => { room(24); const y = doc.y, a = text(pick(k), { size: 9.5, color: MUTED, width: 175, x: X0 + 8, y }), b = text(v, { size: 10.5, bold, width: W - 195, x: X0 + 190, y }); doc.y = Math.max(a, b) + 1; doc.x = X0; };
  heading(pick(L.empInfo));
  row(L.name, lang === 'both' ? (nameAm === nameEn ? nameAm : `${nameAm} / ${nameEn}`) : nm(lang), true); row(L.id, e.employee_no, true);
  row(L.job, lang === 'both' ? (titleAm === titleEn ? titleEn : `${titleAm} / ${titleEn}`) : jt(lang)); row(L.dept, j.department || '—');
  const dd = (iso) => (lang === 'en' ? `${dateEn(iso)}  (${dateEC(iso)})` : lang === 'am' ? dateAm(iso) : `${dateAm(iso)}  /  ${dateEn(iso)}`);
  row(L.start, dd(em.start_date)); row(L.end, ended ? dd(em.end_date) : pick(L.present)); row(L.total, lang === 'both' ? `${dur('am')}  /  ${dur('en')}` : dur(lang), true);
  gapY(6);

  // employment history (the recorded changes of the employee file)
  heading(pick(L.history));
  const TO = lang === 'en' ? ' to ' : ' ወደ ', hist = [{ date: em.start_date, kind: 'hired', detail: [jt(lang === 'en' ? 'en' : 'am'), j.department].filter((x) => x && x !== '—').join(' · ') }, ...snap.history.filter((h) => h.kind !== "hired").map((h) => ({ date: h.date, kind: h.kind, detail: h.from && h.to ? `${h.from}${TO}${h.to}` : h.to || h.from || '' }))];
  for (const h of hist.slice(0, 10)) { room(20); const y = doc.y, a = text(lang === 'en' ? dateEn(h.date) : dateAm(h.date), { size: 9.5, color: MUTED, width: 128, x: X0 + 8, y }), b = text(pick(KIND[h.kind] || [h.kind, h.kind]), { size: 9.5, bold: true, width: 118, x: X0 + 142, y }), c = text(h.detail, { size: 9.5, width: W - 272, x: X0 + 266, y }); doc.y = Math.max(a, b, c); doc.x = X0; }
  gapY(6);

  // responsibilities (typed by HR: shown only when recorded)
  if (snap.responsibilities && snap.responsibilities.trim()) {
    heading(pick(L.resp));
    for (const line of snap.responsibilities.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 10)) { room(18); const y = doc.y; text('•', { size: 10.5, width: 12, x: X0 + 8, y }); const b = text(line, { size: 10, width: W - 30, x: X0 + 22, y }); doc.y = b; doc.x = X0; }
    gapY(4);
  }

  // signature and stamp area: at the foot of the page (a new page when the text above reaches it)
  const BLOCK = 150, limit = doc.page.height - 44 - BLOCK; if (doc.y > limit) newPage();
  const top = doc.page.height - 44 - BLOCK, colW = (W - 30) / 2;
  const sigX = X0, stX = X0 + colW + 30;
  doc.save().lineWidth(0.8).strokeColor('#8fa3ab').moveTo(sigX + 8, top + 70).lineTo(sigX + colW - 8, top + 70).stroke().restore();
  doc.save().lineWidth(0.8).strokeColor('#8fa3ab').dash(3, { space: 3 }).circle(stX + colW / 2, top + 42, 44).stroke().undash().restore();
  if (signature) { try { doc.image(signature, sigX + 24, top + 8, { fit: [colW - 48, 60], align: 'center', valign: 'bottom' }); } catch { /* unreadable image: empty area */ } }
  if (stamp) { try { doc.image(stamp, stX + colW / 2 - 42, top, { fit: [84, 84], align: 'center', valign: 'center' }); } catch { /* unreadable image: empty area */ } }
  text(pick(L.sign), { size: 9, color: MUTED, width: colW, x: sigX, y: top + 74, align: 'center', lineGap: 0 });
  if (approver && approver.name) text(`${approver.name}${approver.title ? ' · ' + approver.title : ''}`, { size: 9.5, bold: true, width: colW, x: sigX, y: top + 90, align: 'center', lineGap: 0 });
  text(pick(L.stamp), { size: 9, color: MUTED, width: colW, x: stX, y: top + 92, align: 'center' });
  doc.y = top + 118; doc.x = X0; rule(); gapY(4); text(pick(L.verify), { size: 8, color: MUTED, align: 'center', lineGap: 0 });

  watermark();   // a draft is clearly marked and can never be mistaken for the issued certificate
  doc.end(); return done;
}
module.exports = { build, makeText, runs, ethiopian, dateAm, dateEn, dateEC, logoPath };
