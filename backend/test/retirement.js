// Retirement management: age rules from the date of birth, statuses, notifications (no duplicates), the process, approval, letter, permissions.
// Run: npm run db:init && npm run seed:all && npm run test:retirement   (creates real records in a DEVELOPMENT database)
require('../src/env'); process.env.RATE_LIMIT_MULT = '50';
const fs = require('fs'), path = require('path'), app = require('../src/index'), { pool } = require('../src/db'), R = require('../src/retirement');
const PW = process.env.SEED_PASSWORD || 'Dev@12345678', ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../uploads'));
let base, pass = 0, fail = 0, LAST;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m, process.env.DEBUG ? JSON.stringify(LAST).slice(0, 400) : ''); } };
const call = async (method, p, body, token) => { const r = await fetch(base + '/api' + p, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) }); const d = r.status === 204 ? {} : await r.json().catch(() => ({})); LAST = { method, p, s: r.status, d }; return { s: r.status, d }; };
const raw = async (p, token) => { const r = await fetch(base + '/api' + p, { headers: { Authorization: 'Bearer ' + token } }); return { s: r.status, buf: Buffer.from(await r.arrayBuffer()) }; };
const login = async (u) => (await call('POST', '/login', { email: `${u}@hrms.test`, password: PW })).d.token;
const sec = (t) => console.log('\n' + t);
(async () => {
  sec('0. Age arithmetic (pure functions)');
  ok(R.ageOn('1966-11-17', '2026-11-17') === 60 && R.ageOn('1966-11-18', '2026-11-17') === 59 && R.ageOn('1966-11-16', '2026-11-17') === 60, 'the age changes exactly on the birthday');
  ok(R.addYears('1964-02-29', 60) === '2024-02-29' && R.addYears('1964-02-29', 61) === '2025-03-01' && R.ageOn('1964-02-29', '2025-02-28') === 60 && R.ageOn('1964-02-29', '2025-03-01') === 61, '29 February birthdays count from 1 March in common years');
  ok(R.statusOf(58, 60, false) === 'active' && R.statusOf(59, 60, false) === 'approaching' && R.statusOf(60, 60, false) === 'eligible' && R.statusOf(75, 60, false) === 'eligible' && R.statusOf(75, 60, true) === 'completed', 'status categories');
  const srv = app.listen(0); base = `http://127.0.0.1:${srv.address().port}`;
  const T = {}; for (const u of ['hrm', 'hro', 'emp', 'exec', 'superadmin']) T[u] = await login(u);
  const today = await R.localToday(), shift = (iso, y, d = 0) => { const dt = new Date(Date.parse(R.addYears(iso, y)) + d * 864e5); return dt.toISOString().slice(0, 10); };
  const tag = Date.now().toString(36).toUpperCase(), LK = (await call('GET', '/lookups', null, T.hrm)).d, dept = LK.departments[0], pos = LK.positions[0];
  const mk = async (name, dob, hire = '2010-01-01') => { const r = await call('POST', '/employees', { first_name: name + tag, father_name: 'Ret', grandfather_name: 'Test', sex: name === 'Fem' ? 'female' : 'male', hire_date: hire, date_of_birth: dob, department_id: dept.id, position_id: pos.id, basic_salary: pos.min_salary || 0, email: `${name}${tag}@hrms.test`.toLowerCase() }, T.hrm); ok(r.s === 201, 'employee ' + name + ' ' + JSON.stringify(r.d).slice(0, 100)); return r.d; };
  const A = await mk('Fem', shift(today, -60)), B = await mk('Day', shift(today, -60, 1)), C = await mk('Fiftynine', shift(today, -59, -100)), D = await mk('Fiftyeight', shift(today, -58)), E = await mk('Newhire', shift(today, -63), '2024-05-01');
  const get = async (q2, t = T.hrm) => (await call('GET', '/retirement/overview?page_size=100&' + q2, null, t)).d;

  sec('1. Automatic identification from the date of birth');
  const el = await get('status=eligible&q=' + tag), ap = await get('status=approaching&q=' + tag), ac = await get('status=active&q=' + tag), all = await get('status=all&q=' + tag);
  const ids = (o) => o.rows.map((x) => x.id).sort();
  ok(JSON.stringify(ids(el)) === JSON.stringify([A.id, E.id].sort()), 'exactly 60 today = eligible; 61+ with a recent hire date = eligible (hire date plays no part)');
  ok(el.rows.find((x) => x.id === A.id).age === 60 && el.rows.find((x) => x.id === A.id).retirement_eligibility_date === today, 'A is 60 today, eligibility date = today');
  ok(JSON.stringify(ids(ap)) === JSON.stringify([B.id, C.id].sort()), 'one day before the 60th birthday and 59 = approaching'); ok(B && ap.rows.find((x) => x.id === B.id).age === 59 && ap.rows.find((x) => x.id === B.id).days_to_eligibility === 1, 'B is still 59 with 1 day to go');
  ok(JSON.stringify(ids(ac)) === JSON.stringify([D.id]), '58 = active'); ok(all.total === 5, 'all five listed');
  const row = el.rows.find((x) => x.id === A.id); ok(['full_name', 'employee_no', 'sex', 'date_of_birth', 'age', 'department', 'job_title', 'hire_date', 'retirement_eligibility_date', 'status'].every((k) => row[k] !== undefined && row[k] !== null), 'all dashboard fields are present');
  ok(el.stats.eligible >= 2 && el.stats.approaching >= 2 && typeof el.stats.completed === 'number', 'statistics'); ok((await get('q=Fiftynine' + tag)).rows.length === 1 && (await get('status=all&q=' + C.employee_no)).rows.length === 1, 'search by name and by ID');
  ok((await get(`status=all&q=${tag}&department_id=${dept.id}`)).total === 5 && (await get(`status=all&q=${tag}&department_id=999999`)).total === 0, 'department filter');
  const sa = (await get('status=all&sort=age&dir=desc&q=' + tag)).rows.map((x) => x.age), sd = (await get('status=all&sort=retirement_date&dir=asc&q=' + tag)).rows.map((x) => x.retirement_eligibility_date);
  ok(sa.every((v, i) => !i || sa[i - 1] >= v) && sd.every((v, i) => !i || sd[i - 1] <= v), 'sort by age and by retirement date');
  ok((await call('GET', '/retirement/overview?status=bogus', null, T.hrm)).s === 400, 'bad status refused'); ok((await call('GET', '/retirement/overview', null, T.emp)).s === 403, 'an employee cannot open the page'); ok((await call('GET', '/retirement/overview', null, T.exec)).s === 200, 'executive can view');

  sec('2. Notifications to the HR Manager (once)');
  const nb = async () => (await pool.query("SELECT count(*)::int n FROM notifications WHERE subject LIKE 'Retirement:%'")).rows[0].n;
  const n0 = await nb(), c1 = await call('POST', '/retirement/check', {}, T.hrm); ok(c1.s === 200 && c1.d.raised >= 4, 'first check raises the milestones ' + JSON.stringify(c1.d));
  const ms = (await pool.query('SELECT employee_id,milestone,notified_at FROM retirement_milestones WHERE employee_id=ANY($1)', [[A.id, B.id, C.id, D.id, E.id]])).rows;
  ok(ms.filter((m) => m.milestone === 'eligible').length === 2 && ms.filter((m) => m.milestone === 'approaching').length === 2 && ms.every((m) => m.notified_at) && !ms.some((m) => m.employee_id === D.id), 'eligible x2, approaching x2, nothing for the 58-year-old, all marked notified');
  const n1 = await nb(); ok(n1 > n0, 'e-mails queued for the HR Manager (' + (n1 - n0) + ')');
  const c2 = await call('POST', '/retirement/check', {}, T.hrm); ok(c2.d.raised === 0 && c2.d.notified === 0 && (await nb()) === n1, 'second check: no new records, no duplicate e-mail');
  ok((await call('POST', '/retirement/check', {}, T.hro)).s === 403, 'only the HR authority can run the check now');
  let dup = false; try { await pool.query("INSERT INTO retirement_milestones(employee_id,milestone,reached_on,retirement_age) VALUES($1,'eligible',$2,60)", [A.id, today]); } catch { dup = true; } ok(dup, 'the database refuses a duplicate milestone');
  const dash = (await call('GET', '/dashboard', null, T.hrm)).d; ok(dash.retirement && dash.retirement.configured && dash.retirement.eligible >= 2 && dash.retirement.approaching >= 2 && dash.retirement.alerts.length > 0, 'HR dashboard shows retirement alerts'); ok(!(await call('GET', '/dashboard', null, T.emp)).d.retirement, 'employee dashboard has none');

  sec('3. Starting the process');
  const det = (await call('GET', `/retirement/employees/${A.id}`, null, T.hro)).d; ok(det.status === 'eligible' && det.age === 60 && det.actions.initiate === true && det.service.years >= 15, 'detail shows employment information and the initiate action');
  ok((await call('POST', `/retirement/employees/${B.id}/initiate`, {}, T.hro)).s === 409, '59-year-old: process refused (not yet 60)'); ok((await call('POST', `/retirement/employees/${D.id}/initiate`, {}, T.hro)).s === 409, '58-year-old refused');
  for (const [n, t] of [['employee', T.emp], ['executive', T.exec], ['super admin', T.superadmin]]) ok((await call('POST', `/retirement/employees/${A.id}/initiate`, {}, t)).s === 403, n + ' cannot start it');
  ok((await call('POST', `/retirement/employees/${A.id}/letter`, {}, T.hro)).s === 409, 'no letter before the approval');
  const [r1, r2] = await Promise.all([call('POST', `/retirement/employees/${A.id}/initiate`, { remarks: 'Reached 60' }, T.hro), call('POST', `/retirement/employees/${A.id}/initiate`, { remarks: 'Reached 60' }, T.hro)]);
  ok([r1.s, r2.s].sort().join() === '201,409', 'two simultaneous clicks create exactly one case'); const cs = r1.s === 201 ? r1.d : r2.d; ok(cs.case_type === 'retirement' && cs.data.remarks === 'Reached 60' && cs.data.expected_date === today, 'case created with the basis and remarks');
  ok((await call('POST', `/retirement/employees/${A.id}/initiate`, {}, T.hro)).s === 409, 'a second process for the same employee is refused');
  let dup2 = false; try { await pool.query("INSERT INTO hr_cases(ref_no,case_type,employee_id,initiated_by,data) VALUES('X-DUP','retirement',$1,1,'{}')", [A.id]); } catch { dup2 = true; } ok(dup2, 'the database refuses a second open retirement case');
  ok((await get('status=eligible&q=' + tag)).rows.find((x) => x.id === A.id).open_case_ref === cs.ref_no, 'the list shows the open case');

  sec('4. Approval by the HR Manager, official retirement date, remarks');
  const act = (t, a, body = {}) => call('POST', `/hr-cases/${cs.id}/action`, { action: a, ...body }, t);
  ok((await act(T.hro, 'submit')).s === 200 && (await act(T.hro, 'review')).s === 200 && (await act(T.hro, 'recommend', { note: 'Recommended' })).s === 200, 'HR submits, reviews and recommends');
  ok((await act(T.hro, 'decide', { decision: 'approved', reason: 'x', effective_date: today })).s === 403, 'HR officer cannot approve the retirement');
  const dc = await act(T.hrm, 'decide', { decision: 'approved', reason: 'Retirement approved: reached the retirement age', effective_date: today }); ok(dc.s === 200 && dc.d.effective_date === today, 'HR Manager approves and records the official retirement date');
  const d2 = (await call('GET', `/retirement/employees/${A.id}`, null, T.hrm)).d; ok(d2.approved_case && d2.approved_case.decided_by_name && d2.actions.letter === true && d2.status === 'eligible', 'approved: letter can now be generated, completion still pending');

  sec('5. Retirement letter (PDF)');
  ok((await call('POST', `/retirement/employees/${A.id}/letter`, { language: 'bogus' }, T.hro)).s === 400, 'bad language refused');
  const lt = await call('POST', `/retirement/employees/${A.id}/letter`, { language: 'am' }, T.hro); ok(lt.s === 201 && /^RTL-\d{4}-\d{5}$/.test(lt.d.ref_no), 'letter generated ' + lt.d.ref_no);
  ok((await call('POST', `/retirement/employees/${A.id}/letter`, {}, T.hro)).s === 409, 'only one letter per retirement case');
  const pdf = await raw(`/retirement/letters/${lt.d.id}/pdf?download=1`, T.hrm); ok(pdf.s === 200 && pdf.buf.slice(0, 4).toString() === '%PDF' && pdf.buf.length > 20000, 'letter downloads as a real PDF (' + pdf.buf.length + ' bytes)'); fs.writeFileSync('/tmp/retirement_test.pdf', pdf.buf);
  ok((await raw(`/retirement/letters/${lt.d.id}/pdf`, T.emp)).s === 404, 'another employee cannot open it');
  const docs = (await call('GET', `/employees/${A.id}/documents`, null, T.hrm)).d; ok(docs.some((x) => /Retirement Letter/.test(x.title)), 'saved in the employee HR profile (documents)');
  let ro = false; try { await pool.query("UPDATE retirement_letters SET language='am' WHERE id=$1", [lt.d.id]); } catch { ro = true; } ok(ro, 'issued letters cannot be changed');

  sec('6. Completion and history');
  const cp = await act(T.hrm, 'complete'); ok(cp.s === 200 && cp.d.stage === 'completed', 'HR Manager completes the retirement');
  const after = await get('status=completed&q=' + tag); const ra = after.rows.find((x) => x.id === A.id); ok(ra && ra.status === 'completed' && ra.official_retirement_date === today && !ra.open_case_id, 'status "Retirement Process Completed" with the official date');
  ok(!(await get('status=eligible&q=' + tag)).rows.some((x) => x.id === A.id) && after.stats.completed >= 1, 'no longer listed as eligible; counted as completed');
  const prof = (await call('GET', `/employees/${A.id}`, null, T.hrm)).d; ok(prof.status === 'on_notice' || prof.status === 'terminated', 'employee separation opened by the existing workflow (' + prof.status + ')'); ok(prof.history.some((h) => /Retirement letter issued/i.test(h.note || '')), 'retirement recorded in the employee history');
  ok((await call('POST', `/retirement/employees/${A.id}/initiate`, {}, T.hro)).s === 409, 'no second retirement record after completion');
  const full = (await call('GET', `/retirement/employees/${A.id}`, null, T.hrm)).d; ok(full.events.length >= 6 && full.milestones.some((m) => m.milestone === 'eligible'), 'history keeps the case events and the notification records');
  ok((await pool.query('SELECT count(*)::int n FROM employees WHERE id=$1', [A.id])).rows[0].n === 1, 'no employee record was deleted');
  const lr = (await pool.query('SELECT employee_id,pdf_storage FROM retirement_letters WHERE id=$1', [lt.d.id])).rows[0]; fs.appendFileSync(path.join(ROOT, 'emp', String(lr.employee_id), lr.pdf_storage), 'x'); ok((await raw(`/retirement/letters/${lt.d.id}/pdf`, T.hrm)).s === 500, 'a tampered letter is detected');
  console.log(`\n${pass} passed, ${fail} failed`); srv.close(); await pool.end(); process.exit(fail ? 1 : 0);
})().catch((x) => { console.error(x); process.exit(1); });
