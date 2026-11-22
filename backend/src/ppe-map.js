// Job-title mapping for the work-clothing and work-tools entitlements of Directive No. 173/2018 (Annex 3).
// The directive names government-wide occupations ("የጥበቃ ሰራተኛ", "ሹፌር" ...); the college's job titles come from its own job-evaluation grading
// ("ጥበቃ ሰራተኛ Il", "ሾፌር l"). They never matched letter for letter, so nobody had an entitlement. This module links a college title to an Annex 3 occupation ONLY when
// they are the same occupation written differently; everything else is listed for HR review. Nothing is invented: the items, quantities and periods are always the directive's.
//
// Automatic rules (title after normalization):
//   exact       - the same words after removing the grade marker (I, II, Il, ll ...), the leading "የ", and spelling variants of the same letter (ሠ/ሰ, ሐ/ኀ/ሀ, ዐ/አ, ጸ/ፀ, ሾ/ሹ).
//   equivalent  - the same words after also leaving out the generic words "ሰራተኛ" (worker) and "ባለሙያ" (expert), in any order.
// A title that matches occupations of different Annex 3 groups is ambiguous and goes to HR review.
const GENERIC = new Set(['ሰራተኛ', 'ሰራተኞች', 'ባለሙያ', 'ባለሙያዎች']);
const RANK_WORDS = new Set(['ሃላፊ', 'ሃላፊዎች', 'ቡድን', 'መሪ', 'ክፍል', 'ዋና', 'ምክትል', 'ተቆጣጣሪ']);   // only say "head / team / deputy": never enough to suggest an occupation
const mapCp = (c) => {   // letters that are only spelling variants of one another
  if (c >= 0x1220 && c <= 0x1227) return c + 0x10;   // ሠ-family -> ሰ-family
  if (c >= 0x1210 && c <= 0x1217) return c - 0x10;   // ሐ-family -> ሀ-family
  if (c >= 0x1280 && c <= 0x1287) return c - 0x80;   // ኀ-family -> ሀ-family
  if (c >= 0x12d0 && c <= 0x12d7) return c - 0x30;   // ዐ-family -> አ-family
  if (c >= 0x1338 && c <= 0x133f) return c + 8;      // ጸ-family -> ፀ-family
  if (c === 0x123e) return 0x1239;                   // ሾ -> ሹ  (ሾፌር / ሹፌር)
  return c;
};
const GRADE = /^(?:[IVXivxlL1|]{1,5}|[0-9]{1,2})$/;   // "I", "II", "Il", "ll", "Ill", "IV", "3" ... as typed in the job-grading register
function tokens(title) {
  const t = String(title || '').normalize('NFC').replace(/[\u200b-\u200d]/g, '').replace(/[()（）\[\]{}\/\\,.፣፤:;።፡"'_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  let w = [...t.replace(/./gu, (ch) => String.fromCodePoint(mapCp(ch.codePointAt(0))))].join('').split(' ').filter(Boolean);
  while (w.length > 1 && GRADE.test(w[w.length - 1])) w.pop();   // the grade marker is not part of the occupation
  if (w.length && w[0].length > 1 && w[0][0] === 'የ') w[0] = w[0].slice(1);   // "የጥበቃ ሰራተኛ" = "ጥበቃ ሰራተኛ"
  return w;
}
const exactKey = (title) => tokens(title).join(' ');
const looseKey = (title) => tokens(title).filter((x) => !GENERIC.has(x)).sort().join(' ');

// every distinct job title used by the employees (the position title; the register's JEG title when no position is linked)
async function collegeTitles(c) {
  return (await c.query(`SELECT COALESCE(pos.title, e.jeg_title) AS title, count(*)::int AS employees FROM employees e LEFT JOIN positions pos ON pos.id=e.position_id
    WHERE e.status<>'terminated' GROUP BY 1 ORDER BY 2 DESC,1 NULLS LAST`)).rows;   // employees without any job title are counted too (they are for HR review)
}
async function annexTitles(c) { return (await c.query("SELECT job_title_pattern AS pattern, min(group_no) AS group_no, count(DISTINCT group_no)::int AS groups, count(*)::int AS items FROM ppe_entitlements WHERE active AND job_title_pattern NOT ILIKE '%unreadable%' AND job_title_pattern NOT LIKE '%[%' GROUP BY 1 ORDER BY 2,1")).rows; }

// the decision for every college title: 'direct' (already the same text), 'mapped' (an active mapping exists), 'automatic' (exact / equivalent), 'ambiguous', 'review'
async function plan(c) {
  const titles = await collegeTitles(c), annex = await annexTitles(c), maps = (await c.query('SELECT college_title,annex_pattern,basis,id FROM ppe_title_map WHERE active')).rows;
  const direct = new Set((await c.query("SELECT DISTINCT job_title_pattern FROM ppe_entitlements WHERE active")).rows.map((r) => r.job_title_pattern.toLowerCase()));
  const ex = new Map(), lo = new Map(); for (const a of annex) { for (const [m, k] of [[ex, exactKey(a.pattern)], [lo, looseKey(a.pattern)]]) { if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(a); } }
  return titles.map((t) => {
    if (!t.title) return { ...t, status: 'review', matches: [], suggestions: [] };
    const mapped = maps.filter((m) => m.college_title === t.title);
    if (direct.has(String(t.title).toLowerCase())) return { ...t, status: 'direct', matches: [] };
    if (mapped.length) return { ...t, status: 'mapped', matches: mapped.map((m) => ({ pattern: m.annex_pattern, basis: m.basis })) };
    let basis = 'exact', hit = ex.get(exactKey(t.title)); if (!hit || !hit.length) { basis = 'equivalent'; hit = lo.get(looseKey(t.title)); }
    if (hit && hit.length) { const groups = new Set(hit.map((h) => h.group_no)); return groups.size === 1 ? { ...t, status: 'automatic', basis, matches: hit.map((h) => ({ pattern: h.pattern, group_no: h.group_no, basis })) } : { ...t, status: 'ambiguous', matches: hit.map((h) => ({ pattern: h.pattern, group_no: h.group_no })) }; }
    // no safe match: show the closest occupations by shared words, for HR to confirm or ignore
    const keep = (x) => !GENERIC.has(x) && !RANK_WORDS.has(x) && x.length > 2, tk = new Set(tokens(t.title).filter(keep)), cand = annex.map((a) => { const at = tokens(a.pattern).filter(keep), s = at.filter((x) => tk.has(x)).length; return { pattern: a.pattern, group_no: a.group_no, shared: s }; }).filter((x) => x.shared > 0).sort((p, q2) => q2.shared - p.shared).slice(0, 3);
    return { ...t, status: 'review', matches: [], suggestions: cand };
  });
}
// writes the automatic links (idempotent: a link that exists is never duplicated or changed; links HR confirmed are never touched)
async function autoMap(c, userId = null) {
  let added = 0; for (const r of await plan(c)) if (r.status === 'automatic') for (const m of r.matches) added += (await c.query("INSERT INTO ppe_title_map(college_title,annex_pattern,group_no,basis,note,created_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id", [r.title, m.pattern, m.group_no, m.basis === 'exact' ? 'automatic_exact' : 'automatic_equivalent', m.basis === 'exact' ? 'Same occupation: grade marker and spelling variants ignored' : 'Same occupation: the generic words worker / expert left out', userId])).rowCount;
  return added;
}
// one title, used when an employee is looked at: links it automatically when it is safely the same occupation (idempotent)
async function ensureTitle(c, title) {
  if (!title) return; if ((await c.query('SELECT 1 FROM ppe_title_map WHERE active AND college_title=$1 LIMIT 1', [title])).rows[0]) return;
  if ((await c.query('SELECT 1 FROM ppe_entitlements WHERE active AND $1 ILIKE job_title_pattern LIMIT 1', [title])).rows[0]) return;
  const annex = await annexTitles(c); let basis = 'exact', hit = annex.filter((a) => exactKey(a.pattern) && exactKey(a.pattern) === exactKey(title)); if (!hit.length) { basis = 'equivalent'; hit = annex.filter((a) => looseKey(a.pattern) && looseKey(a.pattern) === looseKey(title)); }
  if (!hit.length || new Set(hit.map((h) => h.group_no)).size !== 1) return;
  for (const m of hit) await c.query('INSERT INTO ppe_title_map(college_title,annex_pattern,group_no,basis,note) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [title, m.pattern, m.group_no, basis === 'exact' ? 'automatic_exact' : 'automatic_equivalent', basis === 'exact' ? 'Same occupation: grade marker and spelling variants ignored' : 'Same occupation: the generic words worker / expert left out']);
}
const summarize = (rows) => { const sum = (l) => l.reduce((a, r) => a + r.employees, 0), ok = rows.filter((r) => ['direct', 'mapped', 'automatic', 'matched'].includes(r.status)), no = rows.filter((r) => !['direct', 'mapped', 'automatic', 'matched'].includes(r.status)); return { employees: sum(rows), matched: sum(ok), review: sum(no), titles: rows.length, titles_matched: ok.length, titles_review: no.length }; };
module.exports = { summarize, ensureTitle, tokens, exactKey, looseKey, plan, autoMap, collegeTitles, annexTitles };
