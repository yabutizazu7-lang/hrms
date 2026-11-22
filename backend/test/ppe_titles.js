// Tests: uniform / work-tool entitlements by job title (Directive No. 173/2018, Annex 3): matching, no invented entitlements, HR review, exceptions, security.
// Part A needs no database. Part B uses the DEVELOPMENT database (creates a few employees and positions).
// Run: npm run db:init && npm run seed:all && npm run test:ppe-titles
require('../src/env'); process.env.RATE_LIMIT_MULT = '50';
const PM = require('../src/ppe-map');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } }, sec = (t) => console.log('\n' + t);
(async () => {
  sec('A. Title normalization: same occupation, nothing else');
  const same = [['ጥበቃ ሰራተኛ Il', 'የጥበቃ ሰራተኛ'], ['ጥበቃ ሰራተኛ I', 'ጥበቃ ሰራተኛ'], ['ሾፌር l', 'ሹፌር'], ['ሾፌር II', 'ሹፌር'], ['ሁለገብ ጥገና ሰራተኛ Ill', 'ሁለገብ ጥገና ሠራተኛ'], ['እግረኛ ፖስተኛ', 'እግረኛ ፖስተኛ'], ['ጥበቃ ሰራተኛ IV', 'የጥበቃ ሰራተኛ']];
  for (const [a, b] of same) ok(PM.exactKey(a) === PM.exactKey(b), `"${a}" = "${b}" (grade marker and spelling ignored)`);
  ok(PM.looseKey('ጽዳትና ተላላኪ Il') === PM.looseKey('ፅዳትና ተላላኪ ሰራተኛ') && PM.exactKey('ጽዳትና ተላላኪ Il') !== PM.exactKey('ፅዳትና ተላላኪ ሰራተኛ'), 'cleaner and messenger = the directive\'s cleaner and messenger worker (generic word left out, spelling variant)');
  ok(PM.looseKey('ጥበቃ ሰራተኛ ተቆጣጣሪ Il') === PM.looseKey('ጥበቃ ተቆጣጣሪ'), 'guard supervisor');
  const diff = [['ጥበቃ ሰራተኛ', 'ጽዳትና ተላላኪ'], ['ሾፌር', 'ሁለገብ ጥገና ሰራተኛ'], ['ሴክሬታሪ II', 'ጥበቃ ሰራተኛ'], ['የሰው ሀብት ባለሙያ', 'ሹፌር'], ['ወርክ ሾፕ ቴክኒሺያን IV', 'የእንጨት ሥራ ቴክኒሺያን'], ['ዲን/የA-ኢንስትራክተር', 'የጥበቃ ሰራተኛ'], ['ጥበቃ ሰራተኛ', 'ጥበቃ ተቆጣጣሪ']];
  for (const [a, b] of diff) ok(PM.exactKey(a) !== PM.exactKey(b) && (PM.looseKey(a) !== PM.looseKey(b) || a === 'ጥበቃ ሰራተኛ' && false), `"${a}" is NOT "${b}"`);
  ok(PM.tokens('ጥበቃ ሰራተኛ Il').join(' ') === 'ጥበቃ ሰራተኛ' && PM.tokens('Instructor B').join(' ') === 'Instructor B' && PM.tokens('Instructor I').join(' ') === 'Instructor', 'only a trailing grade marker is dropped; real words are kept');

  // ------------------------------------------------------------------ part B
  const app = require('../src/index'), { pool } = require('../src/db'), PW = process.env.SEED_PASSWORD || 'Dev@12345678', srv = app.listen(0), base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, p, body, token) => { const r = await fetch(base + '/api' + p, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) }); let d = null; try { d = await r.json(); } catch {} return { s: r.status, d }; };
  const T = {}; for (const u of ['hrm', 'hro', 'exec', 'mgr', 'emp', 'admin', 'superadmin']) T[u] = (await call('POST', '/login', { email: `${u}@hrms.test`, password: PW })).d.token;
  const tag = Date.now().toString(36).toUpperCase().replace(/[^A-Z]/g, 'X'), dep = (await call('GET', '/lookups', null, T.hrm)).d.departments[0].id;
  let n = 0; const pos = async (title, grade = 'I') => (await pool.query("INSERT INTO positions(code,title,grade,department_id) VALUES($1,$2,$3,$4) RETURNING id", [`PT-${tag}-${++n}`, title, grade, dep])).rows[0].id;
  const emp = async (title) => (await call('POST', '/employees', { first_name: 'Ppe' + (++n), father_name: 'T' + tag, sex: 'male', hire_date: '2015-01-01', department_id: dep, position_id: await pos(title) }, T.hrm)).d;
  const G = await emp('ጥበቃ ሰራተኛ Il'), C = await emp('ጽዳትና ተላላኪ Il'), D = await emp('ሾፌር l'), M = await emp('ሁለገብ ጥገና ሰራተኛ Ill'), I = await emp('ዲን/የA-ኢንስትራክተር'), W = await emp('ወርክ ሾፕ ቴክኒሺያን IV');
  const elig = async (e, tok = T.hrm) => (await call('GET', `/ppe/eligibility/${e.id}`, null, tok)).d, ids = (x) => x.items.map((i) => i.item_id).sort((a, b) => a - b).join();
  const dirItems = async (pattern, sex = 'male') => (await pool.query("SELECT n.item_id,n.quantity,n.per_months,n.first_issue_quantity,n.source_ref FROM ppe_entitlements n JOIN ppe_items i ON i.id=n.item_id WHERE n.active AND n.job_title_pattern=$1 AND (i.applies_to_sex IS NULL OR i.applies_to_sex=$2) ORDER BY n.item_id", [pattern, sex])).rows;   // the directive's "for men" / "for women" items follow the employee's sex
  const counts = async () => ({ items: Number((await pool.query('SELECT count(*) FROM ppe_items')).rows[0].count), ents: Number((await pool.query('SELECT count(*) FROM ppe_entitlements')).rows[0].count), issues: Number((await pool.query('SELECT count(*) FROM ppe_issues')).rows[0].count), stock: Number((await pool.query('SELECT count(*) FROM ppe_stock_moves')).rows[0].count), emps: Number((await pool.query('SELECT count(*) FROM employees')).rows[0].count) });

  sec('B1. Automatic matching and what each employee is entitled to');
  const before = await counts(), r1 = await call('POST', '/ppe/title-map/run', {}, T.hro); ok(r1.s === 200 && r1.d.summary.matched >= 4 && r1.d.summary.review >= 2, 'the matching runs; some employees are matched, others are left for HR review');
  const eg = await elig(G), ec = await elig(C), ed = await elig(D), em = await elig(M), ei = await elig(I), ew = await elig(W);
  const gDir = await dirItems('የጥበቃ ሰራተኛ'), dDir = await dirItems('ሹፌር'), cDir = await dirItems('ፅዳትና ተላላኪ ሰራተኛ'), mDir = await dirItems('ሁለገብ ጥገና ሠራተኛ');
  ok(gDir.length > 0 && eg.items.length === gDir.length && ids(eg) === gDir.map((x) => x.item_id).join(), 'a security guard gets exactly the items the directive lists for guards');
  ok(ed.items.length === dDir.length && ids(ed) === dDir.map((x) => x.item_id).join() && ec.items.length === cDir.length && ids(ec) === cDir.map((x) => x.item_id).join() && em.items.length === mDir.length && ids(em) === mDir.map((x) => x.item_id).join(), 'a driver, a cleaner/messenger and a maintenance worker each get exactly their own list');
  ok(ids(eg) !== ids(ed) && ids(ed) !== ids(ec) && ids(eg) !== ids(ec), 'different job titles get different entitlements');
  ok(eg.items.every((i) => { const d = gDir.find((x) => x.item_id === i.item_id); return d && i.quantity === d.quantity && (i.per_months ?? null) === (d.per_months ?? null) && (i.first_issue_quantity ?? null) === (d.first_issue_quantity ?? null) && i.source_ref === d.source_ref; }), 'authorized quantities, replacement periods and the source (annex and page) are the directive\'s, unchanged');
  ok(eg.items.every((i) => i.cap > 0 && i.remaining === i.cap && i.issued === 0), 'nothing is issued by the matching: the full quantity is still available');
  ok(ei.items.length === 0 && ew.items.length === 0 && ei.has_mapping === false, 'an instructor and a workshop technician have NO entitlement (no such occupation in the directive): nothing is invented');
  ok(eg.job_title === 'ጥበቃ ሰራተኛ Il' && eg.employee.employee_no === G.employee_no, 'the screen data carries the employee and the job title');
  const eligList = (await call('GET', '/ppe/eligible-employees', null, T.hrm)).d, rowOf = (e) => (eligList.rows || eligList).find((x) => x.id === e.id);
  ok(rowOf(G) && rowOf(D) && rowOf(C) && rowOf(M) && !rowOf(I) && !rowOf(W), 'the "eligible employees" list contains the matched employees and not the others');
  ok((await counts()).items === before.items && (await counts()).ents === before.ents && (await counts()).issues === before.issues && (await counts()).stock === before.stock && (await counts()).emps === before.emps, 'items, entitlements, stock and issue history are untouched; no employee was added or removed by the matching');

  sec('B2. Running it again changes nothing');
  const links = Number((await pool.query('SELECT count(*) FROM ppe_title_map')).rows[0].count), r2 = await call('POST', '/ppe/title-map/run', {}, T.hro);
  ok(r2.s === 200 && r2.d.links_added === 0 && Number((await pool.query('SELECT count(*) FROM ppe_title_map')).rows[0].count) === links, 'a second run adds no link');
  ok(ids(await elig(G)) === ids(eg) && Number((await pool.query('SELECT count(*) FROM ppe_entitlements')).rows[0].count) === before.ents, 'same entitlements, no duplicates');
  ok(Number((await pool.query("SELECT count(*) FROM (SELECT college_title,annex_pattern FROM ppe_title_map GROUP BY 1,2 HAVING count(*)>1) x")).rows[0].count) === 0, 'no duplicated link in the database');

  sec('B2b. Items "for men" / "for women" follow the employee\'s sex');
  const GF = await emp('ጥበቃ ሰራተኛ Il'); await pool.query("UPDATE employees SET sex='female' WHERE id=$1", [GF.id]); const egf = await elig(GF), gDirF = await dirItems('የጥበቃ ሰራተኛ', 'female');
  ok(ids(egf) === gDirF.map((x) => x.item_id).join() && gDirF.length > 0 && ids(egf) !== ids(eg), 'a female guard gets the women\'s items of the directive, not the men\'s (and a male guard the opposite)');
  const sexOf = async (list) => (await pool.query('SELECT DISTINCT applies_to_sex FROM ppe_items WHERE id=ANY($1::int[]) AND applies_to_sex IS NOT NULL', [list.map((i) => i.item_id)])).rows.map((r) => r.applies_to_sex).join();
  ok((await sexOf(eg.items)) === 'male' && (await sexOf(egf.items)) === 'female', 'no item meant for the other sex is on either list');
  const wrong = egf.items.length ? 0 : 1; const maleOnly = gDir.find((x) => !gDirF.some((y) => y.item_id === x.item_id)); ok(maleOnly && (await call('POST', '/ppe/issues', { employee_id: GF.id, item_id: maleOnly.item_id, quantity: 1 }, T.hrm)).s === 409, 'issuing a men\'s item to a woman is refused');
  sec('B3. Employees without a matching occupation are reported, not given invented rights');
  const mv = (await call('GET', '/ppe/title-map', null, T.hrm)).d, row = (t) => mv.rows.find((x) => x.title === t);
  ok(row('ጥበቃ ሰራተኛ Il').status === 'matched' && row('ጥበቃ ሰራተኛ Il').matches[0].pattern === 'የጥበቃ ሰራተኛ', 'the guard title is linked to the directive occupation');
  ok(row('ዲን/የA-ኢንስትራክተር').status === 'review' && row('ወርክ ሾፕ ቴክኒሺያን IV').status === 'review', 'instructor and workshop technician titles are for HR review');
  ok(mv.summary.matched + mv.summary.review === mv.summary.employees && mv.summary.titles_matched + mv.summary.titles_review === mv.summary.titles, 'every employee and every title is accounted for: matched + for review = all');
  const rep = (await call('GET', '/ppe/title-map/report', null, T.hrm)).d; ok(rep.matched.some((x) => x.employee_no === G.employee_no && x.items === gDir.length) && rep.review.some((x) => x.employee_no === I.employee_no && /no occupation/.test(x.reason)) && rep.matched.length + rep.review.length === rep.summary.employees, 'the employee lists name who is matched (with the item count) and who needs HR review (with the reason)');
  const exI = await call('POST', '/ppe/issues', { employee_id: I.id, item_id: gDir[0].item_id, quantity: 1 }, T.hrm); ok(exI.s === 409 && /No entitlement exists for this job title/.test(exI.d.error), 'issuing to an employee without an entitlement is refused with a clear message');
  const exG = await call('POST', '/ppe/issues', { employee_id: G.id, item_id: dDir.find((x) => !gDir.some((g) => g.item_id === x.item_id))?.item_id || 0, quantity: 1 }, T.hrm); ok(exG.s === 409 || exG.s === 404, 'an item that is not in the guard\'s list is refused');

  sec('B4. HR review: confirm or switch off a link');
  const annex = (await call('GET', '/ppe/title-map', null, T.hrm)).d.annex, pat = annex.find((a) => a.pattern === 'ሹፌር') || annex[0];
  ok((await call('POST', '/ppe/title-map', { college_title: 'ወርክ ሾፕ ቴክኒሺያን IV', annex_pattern: pat.pattern }, T.hro)).s === 400, 'HR must give a reason');
  ok((await call('POST', '/ppe/title-map', { college_title: 'ወርክ ሾፕ ቴክኒሺያን IV', annex_pattern: 'not in the directive', note: 'x' }, T.hro)).s === 404 && (await call('POST', '/ppe/title-map', { college_title: 'no employee has this title', annex_pattern: pat.pattern, note: 'x' }, T.hro)).s === 404, 'only real job titles and real directive occupations can be linked');
  const cf = await call('POST', '/ppe/title-map', { college_title: 'ወርክ ሾፕ ቴክኒሺያን IV', annex_pattern: pat.pattern, note: 'HR confirmed: same occupation' }, T.hro); ok(cf.s === 201 && cf.d.basis === 'hr_confirmed', 'HR confirms with a reason');
  const ew2 = await elig(W); ok(ew2.items.length > 0 && ew2.items.every((i) => i.source_ref), 'the workshop technician now has the entitlements of the confirmed occupation (the directive\'s quantities)');
  await new Promise((r) => setTimeout(r, 400)); ok(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE action='confirm' AND entity='ppe_title_map'")).rows[0].count) >= 1, 'the confirmation is audited');
  ok((await call('DELETE', `/ppe/title-map/${cf.d.id}`, null, T.hro)).s === 200 && (await elig(W)).items.length === 0, 'switching the link off removes the entitlements again');
  await call('POST', '/ppe/title-map/run', {}, T.hro); ok((await elig(W)).items.length === 0, 'the automatic run does not bring back a link HR switched off');

  sec('B5. Issuing: authorized quantity, exceptions, responsible officer');
  const it = eg.items.find((i) => i.cap >= 1) , item = it.item_id; await call('POST', '/ppe/stock', { item_id: item, move_type: 'receive', qty: 100, note: 'test stock' }, T.hrm);
  const i1 = await call('POST', '/ppe/issues', { employee_id: G.id, item_id: item, quantity: 1, condition_note: 'new', exception: false }, T.hro);
  ok(i1.s === 201 && i1.d.job_title_at_issue === 'ጥበቃ ሰራተኛ Il' && i1.d.authorized_quantity === it.cap && i1.d.issued_by > 0, 'an issue within the entitlement is recorded with the job title, the authorized quantity and the responsible HR officer');
  const over = await call('POST', '/ppe/issues', { employee_id: G.id, item_id: item, quantity: it.cap + 5 }, T.hro); ok(over.s === 409 && /more may be issued|waiting period/.test(over.d.error), 'issuing beyond the authorized quantity is refused');
  ok((await call('POST', '/ppe/issues', { employee_id: G.id, item_id: item, quantity: it.cap + 5, exception: true, exception_reason: 'Heavy use', exception_ref: 'Letter 12' }, T.hro)).s === 403, 'an HR officer cannot authorize an exception');
  ok((await call('POST', '/ppe/issues', { employee_id: G.id, item_id: item, quantity: it.cap + 5, exception: true }, T.hrm)).s === 400, 'an exception needs a reason and the reference of the authorization');
  const ex = await call('POST', '/ppe/issues', { employee_id: G.id, item_id: item, quantity: it.cap + 5, exception: true, exception_reason: 'Heavy use at the gate', exception_ref: 'Letter 12/2026' }, T.hrm);
  ok(ex.s === 201 && ex.d.exception_reason === 'Heavy use at the gate' && ex.d.exception_ref === 'Letter 12/2026' && ex.d.exception_by > 0, 'the HR Manager can authorize and document an exception');
  await new Promise((r) => setTimeout(r, 400)); ok(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE action='issue_exception'")).rows[0].count) >= 1, 'the exception is audited');
  const log = (await call('GET', '/ppe/issues', null, T.hro)).d, l1 = log.find((x) => x.id === i1.d.id); ok(l1 && l1.issued_by_name && l1.job_title_at_issue && l1.authorized_quantity === it.cap, 'the issue log shows the responsible officer, job title and authorized quantity');

  sec('B6. HR only');
  for (const [u, who] of [['exec', 'the executive'], ['mgr', 'a line manager'], ['emp', 'an employee'], ['admin', 'the system administrator'], ['superadmin', 'the technical account']]) {
    const rs = [await call('GET', '/ppe/title-map', null, T[u]), await call('POST', '/ppe/title-map/run', {}, T[u]), await call('POST', '/ppe/title-map', { college_title: 'x', annex_pattern: 'y', note: 'z' }, T[u]), await call('GET', '/ppe/title-map/report', null, T[u]), await call('GET', '/ppe/eligible-employees', null, T[u]), await call('POST', '/ppe/issues', { employee_id: G.id, item_id: item, quantity: 1 }, T[u]), await call('GET', '/ppe/issues', null, T[u]), await call('GET', `/ppe/eligibility/${G.id}`, null, T[u])];
    ok(rs.every((r) => r.s === 403), `${who} cannot see the mapping, run it, issue items or read the entitlements (${rs.map((r) => r.s).join(',')})`);
  }
  ok((await call('POST', '/ppe/title-map/run', {}, T.hrm)).s === 200 && (await call('GET', '/ppe/title-map', null, T.hro)).s === 200, 'the HR Manager and HR officers can');
  const cnt = await counts(); ok(cnt.items === before.items && cnt.ents === before.ents, 'the catalogue and the directive entitlements are still exactly as imported');

  console.log(`\n${pass} passed, ${fail} failed`); srv.close(); await pool.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
