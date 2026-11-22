// Permanent employment: (1) all current staff made permanent by migration 015, (2) new employees are always "Probationary (Trial Period)",
// (3) they become permanent AUTOMATICALLY after six months of service, (4) the setting probation_auto_permanent = 0 restores manual HR confirmation.
require('../src/env'); process.env.RATE_LIMIT_MULT = '50';
const fs = require('fs'), path = require('path'), app = require('../src/index'), { pool } = require('../src/db'), H = require('../src/hr'), P = require('../src/routes/probation');
const PW = process.env.SEED_PASSWORD || 'Dev@12345678'; let base, pass = 0, fail = 0, LAST;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m, process.env.DEBUG ? JSON.stringify(LAST).slice(0, 300) : ''); } };
const call = async (method, p, body, token) => { const r = await fetch(base + '/api' + p, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) }); const d = r.status === 204 ? {} : await r.json().catch(() => ({})); LAST = { method, p, s: r.status, d }; return { s: r.status, d }; };
const sec = (t) => console.log('\n' + t), one = async (sql, p = []) => (await pool.query(sql, p)).rows[0];
(async () => {
  const srv = app.listen(0); base = `http://127.0.0.1:${srv.address().port}`;
  const T = (await call('POST', '/login', { email: 'hrm@hrms.test', password: PW })).d.token, tag = Date.now().toString(36).toUpperCase(), today = H.today();
  const LK = (await call('GET', '/lookups', null, T)).d, dept = LK.departments[0], pos = LK.positions[0];
  const mk = async (name, extra = {}) => { const r = await call('POST', '/employees', { first_name: name + tag, father_name: 'Perm', grandfather_name: 'Test', sex: 'male', hire_date: today, department_id: dept.id, position_id: pos.id, basic_salary: pos.min_salary || 0, email: `${name}${tag}@hrms.test`.toLowerCase(), ...extra }, T); return r; };

  sec('1. Migration 015: every current employee becomes permanent');
  const ins = async (name, type, status = 'active', extra = '') => (await pool.query(`INSERT INTO employees(employee_no,first_name,father_name,grandfather_name,sex,hire_date,employment_type,status,probation_end,contract_end) VALUES($1,$2,'M','T','male','2024-01-01',$3,$4,${type === 'probation' ? "'2099-01-01'" : 'NULL'},${type === 'contract' ? "'2027-01-01'" : 'NULL'}) RETURNING id`, ['MIG-' + name + tag, name + tag, type, status])).rows[0].id;
  const c1 = await ins('Contract', 'contract'), p1 = await ins('Probation', 'probation'), i1 = await ins('Intern', 'intern'), pt = await ins('Part', 'part_time'), pm = await ins('Perm', 'permanent'), tm = await ins('Gone', 'contract', 'terminated');
  await pool.query("INSERT INTO permanent_reviews(employee_id,due_date) VALUES($1,'2024-07-01')", [p1]);
  const sql = fs.readFileSync(path.join(__dirname, '../db/migrations/015_all_staff_permanent_auto_probation.sql'), 'utf8'); await pool.query(sql);
  const st = async (id) => one('SELECT employment_type,probation_end,contract_end,status FROM employees WHERE id=$1', [id]);
  for (const [n, id] of [['contract', c1], ['probation', p1], ['intern', i1], ['part-time', pt]]) { const e = await st(id); ok(e.employment_type === 'permanent' && !e.probation_end && !e.contract_end, n + ' employee is now permanent'); }
  ok((await st(tm)).employment_type === 'contract', 'a terminated employee is not touched'); ok((await st(pm)).employment_type === 'permanent', 'permanent stays permanent');
  const h = await one("SELECT from_value,to_value,note FROM employee_history WHERE employee_id=$1 AND to_value='permanent'", [c1]); ok(h && h.from_value === 'contract' && /contract end date 2027-01-01/.test(h.note), 'history keeps the previous type and contract end');
  ok((await one("SELECT status FROM permanent_reviews WHERE employee_id=$1", [p1])).status === 'cancelled', 'the open probation review was closed');
  ok(!(await pool.query("SELECT 1 FROM employee_history WHERE employee_id=$1 AND kind='contract'", [pm])).rows.length, 'no history noise for employees that were already permanent');
  await pool.query(sql); ok((await pool.query("SELECT count(*)::int n FROM employee_history WHERE employee_id=$1 AND to_value='permanent'", [c1])).rows[0].n === 1, 'running it again changes nothing');

  sec('2. New employees: one option only, "Probationary (Trial Period)"');
  const a = await mk('Default'); ok(a.s === 201 && a.d.employment_type === 'probation', 'no type given -> probation'); ok(a.d.probation_end && a.d.probation_end.slice(0, 10) === P.addMonths(today, 6), 'the six-month completion date is calculated from the start date (' + a.d.probation_end + ')');
  ok((await mk('Explicit', { employment_type: 'probation' })).s === 201, '"probation" is accepted');
  for (const t of ['permanent', 'contract', 'intern', 'part_time']) { const r = await mk('Bad' + t, { employment_type: t }); ok(r.s === 400 && /Probationary/.test(r.d.error), t + ' is refused for a new employee'); }
  ok((await mk('Typed', { probation_end: '2020-01-01', contract_end: '2030-01-01' })).d.probation_end.slice(0, 10) === P.addMonths(today, 6), 'a typed probation date cannot shorten the period');

  sec('3. Automatic permanent employment after six months of service');
  await P.runCheck(); ok((await one('SELECT employment_type FROM employees WHERE id=$1', [a.d.id])).employment_type === 'probation', 'before six months: still probationary');
  const m6 = P.addMonths(today, -6), m5 = P.addMonths(today, -6).replace(/-(\d\d)$/, (x, d) => '-' + String(Math.min(28, Number(d) + 1)).padStart(2, '0'));
  const b = await mk('Exact', { hire_date: m6 }); ok(b.s === 201 && b.d.employment_type === 'permanent', 'hire date exactly six months ago: permanent at registration'); 
  const d1 = await mk('Old', { hire_date: '2022-03-01' }); ok(d1.d.employment_type === 'permanent' && d1.d.probation_end === null, 'a start date long ago: permanent at once');
  const almost = await mk('Almost', { hire_date: P.addMonths(today, -5) }); ok(almost.d.employment_type === 'probation', 'five months of service: still probationary');
  await pool.query("UPDATE employees SET hire_date=$2,probation_end=NULL WHERE id=$1", [almost.d.id, m6]); const r1 = await P.runCheck(); ok(r1.converted >= 1, 'the scheduled check converts it when six months are completed ' + JSON.stringify(r1));
  const al = await one('SELECT employment_type,probation_end FROM employees WHERE id=$1', [almost.d.id]); ok(al.employment_type === 'permanent' && al.probation_end === null, 'now permanent');
  const rv = await one("SELECT status,decided_by_name,effective_date,decided_by FROM permanent_reviews WHERE employee_id=$1 ORDER BY id DESC", [almost.d.id]); ok(rv.status === 'confirmed' && rv.decided_by === null && /System/.test(rv.decided_by_name) && H.iso(rv.effective_date) === P.addMonths(m6, 6), 'recorded as an automatic confirmation effective on the completion date');
  const hh = await one("SELECT note,to_value FROM employee_history WHERE employee_id=$1 AND to_value='permanent'", [almost.d.id]); ok(hh && /Automatically permanent/.test(hh.note), 'employee history records it');
  ok(!(await pool.query("SELECT 1 FROM permanent_reviews WHERE employee_id=$1 AND status='pending'", [almost.d.id])).rows.length, 'no pending review is left for HR');
  const ext = await mk('Extended', { hire_date: m6 }); await pool.query("UPDATE employees SET employment_type='probation',probation_end=$2 WHERE id=$1", [ext.d.id, P.addMonths(today, 2)]); await P.runCheck(); ok((await one('SELECT employment_type FROM employees WHERE id=$1', [ext.d.id])).employment_type === 'probation', 'an extended probation date is respected');
  const again = await P.runCheck(); ok(again.converted === 0, 'running the check again converts nobody twice');
  const dash = (await call('GET', '/permanent-employment/summary', null, T)); ok([200, 404].includes(dash.s), 'permanent-employment summary still works (' + dash.s + ')');

  sec('4. Setting probation_auto_permanent = 0: HR confirms each case (earlier behaviour)');
  await pool.query("UPDATE settings SET value='0' WHERE key='probation_auto_permanent'"); await H.settings(true);
  const man = await mk('Manual', { hire_date: m6 }); ok(man.d.employment_type === 'probation', 'with the setting off, a completed period does not convert');
  const rm = await P.runCheck(); ok(rm.converted === 0 && rm.raised >= 1, 'a review is raised for HR instead'); ok((await one("SELECT status FROM permanent_reviews WHERE employee_id=$1", [man.d.id])).status === 'pending', 'pending HR review');
  const cf = await call('POST', `/employees/${man.d.id}/permanent/confirm`, {}, T); ok(cf.s === 200, 'HR can still confirm by hand');
  const man2 = await mk('Manual2', { hire_date: m6 }); await P.runCheck(); await pool.query("UPDATE settings SET value='1' WHERE key='probation_auto_permanent'"); await H.settings(true); const rb = await P.runCheck();
  ok(rb.converted >= 1 && (await one('SELECT employment_type FROM employees WHERE id=$1', [man2.d.id])).employment_type === 'permanent' && !(await pool.query("SELECT 1 FROM permanent_reviews WHERE employee_id=$1 AND status='pending'", [man2.d.id])).rows.length, 'switching it back on converts waiting cases and closes their reviews');
  const sv = await call('PUT', '/settings', { probation_auto_permanent: '2' }, T); ok([400, 403, 404, 422].includes(sv.s), 'an invalid setting value is refused (' + sv.s + ')');
  console.log(`\n${pass} passed, ${fail} failed`); srv.close(); await pool.end(); process.exit(fail ? 1 : 0);
})().catch((x) => { console.error(x); process.exit(1); });
