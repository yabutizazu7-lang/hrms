// Tests: payroll is gone; six-month probation -> eligibility -> HR decision. DEVELOPMENT database only (creates records).
// Run: npm run db:init && npm run seed:all && npm run test:probation
require('../src/env'); process.env.RATE_LIMIT_MULT = '50';
const app = require('../src/index'), { pool } = require('../src/db'), P = require('../src/routes/probation');
const PW = process.env.SEED_PASSWORD || 'Dev@12345678';
let base, pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } }, sec = (t) => console.log('\n' + t);
const call = async (method, p, body, token) => { const r = await fetch(base + '/api' + p, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) }); let d = null; try { d = await r.json(); } catch {} return { s: r.status, d }; };
const login = async (u, pw = PW) => (await call('POST', '/login', { email: u.includes('@') ? u : `${u}@hrms.test`, password: pw })).d.token;
const iso = (d) => d.toISOString().slice(0, 10), TODAY = iso(new Date()), addD = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const tag = Date.now().toString(36).toUpperCase();
(async () => {
  const srv = app.listen(0); base = `http://127.0.0.1:${srv.address().port}`;
  await pool.query("UPDATE settings SET value='0' WHERE key='probation_auto_permanent'"); await require('../src/hr').settings(true);   // this suite tests the MANUAL HR-confirmation mode (the automatic mode is tested in test/permanent.js)
  const T = {}; for (const u of ['hrm', 'hro', 'admin', 'emp', 'exec', 'mgr']) T[u] = await login(u);
  const LK = (await call('GET', '/lookups', null, T.hrm)).d, dep = LK.departments[0].id, pos = LK.positions[0].id;
  let n = 0; const mk = async (extra = {}) => { n++; const r = await call('POST', '/employees', { first_name: 'Prb' + n, father_name: 'T' + tag, sex: 'female', hire_date: addD(TODAY, -30), department_id: dep, position_id: pos, employment_type: 'probation', ...extra }, T.hrm); if (r.s !== 201) console.log('  mk failed', r.s, JSON.stringify(r.d)); return r.d; };
  const get = async (id, tok = T.hrm) => (await call('GET', `/employees/${id}`, null, tok)).d;

  sec('1. Payroll is gone');
  ok((await call('GET', '/payroll/runs', null, T.hrm)).s === 404, 'the payroll API no longer exists'); ok((await call('GET', '/tax-brackets', null, T.admin)).s === 404, 'the tax-bracket API no longer exists');
  const perms = (await call('GET', '/permissions', null, T.admin)).d; ok(Array.isArray(perms) ? !JSON.stringify(perms).includes('payroll.') : true, 'no payroll permissions');
  ok(!JSON.stringify((await call('GET', '/roles', null, T.admin)).d).includes('payroll_officer'), 'no payroll officer role');
  ok((await pool.query("SELECT to_regclass('public.payslips') a, to_regclass('public.payroll_runs') b")).rows[0].a === null, 'payroll tables are dropped (they were empty)');
  ok((await get((await pool.query('SELECT id FROM employees ORDER BY id LIMIT 1')).rows[0].id)).basic_salary !== undefined, 'salary data of employees is still there for HR');
  ok(Number((await pool.query("SELECT count(*) FROM information_schema.columns WHERE table_name='employees' AND column_name IN ('basic_salary','pension_no','bank_account')")).rows[0].count) === 3, 'salary, pension number and bank columns are untouched');

  sec('2. The six-month calculation');
  const cases = [['2025-08-31', '2026-02-28'], ['2023-08-31', '2024-02-29'], ['2023-12-31', '2024-06-30'], ['2024-01-31', '2024-07-31'], ['2026-01-15', '2026-07-15'], ['2025-08-30', '2026-02-28'], ['2023-08-29', '2024-02-29'], ['2024-02-29', '2024-08-29'], ['2025-12-01', '2026-06-01'], ['2020-02-29', '2020-08-29']];
  for (const [a, b] of cases) ok(P.addMonths(a, 6) === b, `${a} + 6 months = ${b} (got ${P.addMonths(a, 6)})`);
  let same = true; for (let i = 0; i < 1500; i++) { const d = addD('2019-01-01', i * 3); const sql = (await pool.query("SELECT to_char($1::date + interval '6 months','YYYY-MM-DD') AS x", [d])).rows[0].x; if (sql !== P.addMonths(d, 6)) { same = false; console.log('   differs', d, sql, P.addMonths(d, 6)); break; } }
  ok(same, 'the application calculation equals PostgreSQL for 1 500 dates (month-ends and leap years included)');
  ok(P.addMonths('2026-01-31', 12) === '2027-01-31' && P.addMonths('2026-03-31', 11) === '2027-02-28', 'other lengths (12 and 11 months) clamp correctly');

  sec('3. Registration and the profile');
  const A = await mk({ hire_date: addD(TODAY, -30), probation_end: '2020-01-01' });
  ok(A.employment_type === 'probation' && String(A.probation_end).slice(0, 10) === P.addMonths(addD(TODAY, -30), 6), 'the completion date is calculated from the start date (a typed date is ignored)');
  let dA = await get(A.id); ok(dA.probation.state === 'on_probation' && dA.probation.completion_date === P.addMonths(addD(TODAY, -30), 6) && dA.probation.remaining_days > 100 && dA.probation.eligible === false, 'profile shows the completion date, remaining days and "not yet eligible"');
  ok(dA.probation.start_date === addD(TODAY, -30) && dA.probation.reviews.length === 0, 'start date shown, no review yet');
  const before = (await get(A.id)).probation_end; await call('PUT', `/employees/${A.id}`, { phone: '0911223344', notes: 'x' }, T.hrm); ok(String((await get(A.id)).probation_end).slice(0, 10) === String(before).slice(0, 10), 'editing the profile does not reset the six-month period');
  ok((await call('PUT', `/employees/${A.id}`, { hire_date: addD(TODAY, -20) }, T.hrm)).s === 400, 'a start-date correction needs a reason');
  const fix = await call('PUT', `/employees/${A.id}`, { hire_date: addD(TODAY, -45), change_note: 'Contract says 45 days ago' }, T.hrm); ok(fix.s === 200, 'HR corrects the start date with a reason');
  dA = await get(A.id); ok(dA.probation.completion_date === P.addMonths(addD(TODAY, -45), 6), 'the completion date follows the corrected start date');
  ok(dA.history.some((h) => h.kind === 'note' && /Hire date corrected/.test(h.note) && /45 days|Contract says/.test(h.note)), 'the correction is in the employment history');
  ok((await pool.query("SELECT 1 FROM audit_logs WHERE action='correct_hire_date' AND entity_id=$1", [String(A.id)])).rows[0] !== undefined, 'the correction is in the audit trail');
  ok((await call('GET', '/permanent-employment', null, T.hrm)).d.some((x) => x.id === A.id && x.state === 'on_probation'), 'listed on the probation page');

  sec('4. Eligibility, one notification, no duplicates');
  const B = await mk({ hire_date: P.addMonths(TODAY, -7) }), Bdue = P.addMonths(P.addMonths(TODAY, -7), 6);
  ok(String(B.probation_end).slice(0, 10) === Bdue, 'an employee who started 7 months ago is already past the completion date');
  const subj = `Permanent employment decision required: ${B.full_name}%`, cnt = async () => Number((await pool.query('SELECT count(*) FROM notifications WHERE subject LIKE $1', [subj])).rows[0].count);
  const r1 = await P.runCheck(); ok(r1.raised >= 1, 'the scheduled check raises the review'); const c1 = await cnt(); ok(c1 >= 2, 'authorized HR officers and administrators are notified');
  const rcp = (await pool.query('SELECT to_email FROM notifications WHERE subject LIKE $1', [subj])).rows.map((x) => x.to_email);
  const hrmEmail = (await pool.query("SELECT email FROM users WHERE role='hr_manager' AND active LIMIT 1")).rows[0]?.email, adminEmail = (await pool.query("SELECT email FROM users WHERE role='admin' AND active LIMIT 1")).rows[0]?.email, empEmail = (await pool.query("SELECT email FROM users WHERE role='employee' AND active LIMIT 1")).rows[0]?.email;
  ok(rcp.includes(hrmEmail) && rcp.includes(adminEmail) && !rcp.includes(empEmail), 'HR manager and administrator are notified, an ordinary employee is not');
  const r2 = await P.runCheck(), r3 = await Promise.all([P.runCheck(), P.runCheck()]); ok(r2.raised === 0 && r2.notified === 0 && r3.every((x) => x.raised === 0 && x.notified === 0) && (await cnt()) === c1, 'running the check again (even twice at once) creates no second review or notification');
  ok(Number((await pool.query("SELECT count(*) FROM permanent_reviews WHERE employee_id=$1", [B.id])).rows[0].count) === 1, 'exactly one review row');
  const dB = await get(B.id); ok(dB.probation.state === 'awaiting_decision' && dB.probation.eligible === true && dB.probation.remaining_days === 0, 'profile shows eligible / pending approval');
  const sm = (await call('GET', '/permanent-employment/summary', null, T.hrm)).d; ok(sm.awaiting_review >= 1 && sm.approaching >= 0 && sm.confirmed >= 0 && sm.decision_pending >= 0, 'summary numbers'); ok((await call('GET', '/dashboard', null, T.hrm)).d.probation.awaiting_review === sm.awaiting_review, 'the same numbers are on the HR dashboard');
  ok((await call('GET', '/permanent-employment/summary', null, T.emp)).s === 403, 'an ordinary employee cannot see the HR numbers');

  sec('5. Who may decide');
  ok((await call('POST', `/employees/${B.id}/permanent/confirm`, {}, T.emp)).s === 403, 'an employee cannot confirm'); ok((await call('POST', `/employees/${B.id}/permanent/confirm`, {}, T.admin)).s === 403, 'a system administrator without HR rights cannot confirm'); ok((await call('POST', `/employees/${B.id}/permanent/confirm`, {}, T.exec)).s === 403, 'an executive cannot confirm'); ok((await call('POST', `/employees/${B.id}/permanent/confirm`, {}, T.mgr)).s === 403, 'a line manager cannot confirm');
  ok((await call('POST', `/employees/${A.id}/permanent/confirm`, {}, T.hrm)).s === 400, 'cannot confirm before the six months are completed');
  const S = await mk({ hire_date: P.addMonths(TODAY, -8), department_id: dep }); const su = await call('POST', '/users', { name: S.full_name, email: `self${tag}@hrms.test`, role: 'hr_officer', password: 'Test#Pass12345', employee_id: S.id }, T.admin);
  if (su.s === 201 || su.s === 200) { const tk = await login(`self${tag}@hrms.test`, 'Test#Pass12345'); await P.runCheck(); ok((await call('POST', `/employees/${S.id}/permanent/confirm`, {}, tk)).s === 403, 'nobody can confirm their own permanent employment'); } else ok(false, 'could not create the self test user ' + JSON.stringify(su.d));
  ok((await call('POST', `/employees/${B.id}/permanent/confirm`, { effective_date: addD(TODAY, 3) }, T.hro)).s === 400, 'effective date cannot be in the future'); ok((await call('POST', `/employees/${B.id}/permanent/confirm`, { effective_date: addD(Bdue, -1) }, T.hro)).s === 400, 'effective date cannot be before the completion date');

  sec('6. Confirmation');
  const cf = await call('POST', `/employees/${B.id}/permanent/confirm`, { effective_date: Bdue, remarks: 'Good performance' }, T.hro); ok(cf.s === 200, 'an authorized HR officer confirms');
  const dB2 = await get(B.id); ok(dB2.employment_type === 'permanent' && dB2.probation_end === null && dB2.probation.state === 'confirmed', 'employment type is now Permanent');
  const rv = dB2.probation.reviews[0]; ok(rv.status === 'confirmed' && String(rv.effective_date).slice(0, 10) === Bdue && rv.decided_by_name && rv.decided_at && rv.remarks === 'Good performance', 'effective date, approval date, approving officer and remarks are recorded');
  ok(dB2.history.some((h) => h.kind === 'status_change' && h.from_value === 'probation' && h.to_value === 'permanent'), 'the status change is in the employment history');
  ok((await pool.query("SELECT 1 FROM audit_logs WHERE action='confirm_permanent' AND entity_id=$1", [String(B.id)])).rows[0] !== undefined, 'the confirmation is audited');
  ok((await call('POST', `/employees/${B.id}/permanent/confirm`, {}, T.hro)).s === 400 && (await call('POST', `/employees/${B.id}/permanent/decline`, { reason: 'x', next_action: 'other' }, T.hro)).s === 400, 'a second decision is refused (no duplicate status change)');
  ok(Number((await pool.query("SELECT count(*) FROM employee_history WHERE employee_id=$1 AND kind='status_change'", [B.id])).rows[0].count) === 1, 'exactly one status-change record');
  ok((await call('GET', '/permanent-employment', null, T.hrm)).d.some((x) => x.id === B.id && x.state === 'confirmed'), 'listed as confirmed');

  sec('7. Not approved');
  const C = await mk({ hire_date: P.addMonths(TODAY, -6) }); await P.runCheck();
  ok((await call('POST', `/employees/${C.id}/permanent/decline`, { next_action: 'other' }, T.hro)).s === 400, 'a reason is required'); ok((await call('POST', `/employees/${C.id}/permanent/decline`, { reason: 'Needs more time', next_action: 'extend_probation' }, T.hro)).s === 400, 'extending needs a new review date'); ok((await call('POST', `/employees/${C.id}/permanent/decline`, { reason: 'Needs more time', next_action: 'extend_probation', next_review_date: addD(TODAY, -1) }, T.hro)).s === 400, 'the new review date must be in the future');
  const nxt = addD(TODAY, 90), dc = await call('POST', `/employees/${C.id}/permanent/decline`, { reason: 'Needs more time', next_action: 'extend_probation', next_review_date: nxt, remarks: 'Review again' }, T.hro); ok(dc.s === 200, 'HR records the decision, reason and next action');
  const dC = await get(C.id); ok(dC.employment_type === 'probation' && String(dC.probation_end).slice(0, 10) === nxt && dC.probation.state === 'on_probation' && dC.probation.reviews[0].status === 'not_approved' && dC.probation.reviews[0].reason === 'Needs more time' && dC.probation.reviews[0].next_action === 'extend_probation', 'probation is extended; the decision is kept');
  ok((await call('POST', `/employees/${C.id}/permanent/decline`, { reason: 'again', next_action: 'other' }, T.hro)).s === 400, 'the employee is not eligible again until the new date');
  const D = await mk({ hire_date: P.addMonths(TODAY, -6) }); await P.runCheck(); ok((await call('POST', `/employees/${D.id}/permanent/decline`, { reason: 'Unsatisfactory evaluation', next_action: 'start_separation' }, T.hro)).s === 200, 'decline without extension'); ok((await get(D.id)).probation.state === 'not_approved', 'state: not approved'); ok((await call('POST', `/employees/${D.id}/permanent/decline`, { reason: 'again', next_action: 'other' }, T.hro)).s === 400, 'the same decision is not recorded twice');
  const rc = await call('POST', `/employees/${D.id}/permanent/confirm`, { remarks: 'Reconsidered' }, T.hro); if (rc.s !== 200) console.log('   reconsider ->', rc.s, JSON.stringify(rc.d)); ok(rc.s === 200 && (await get(D.id)).probation.reviews.length === 2, 'HR can reconsider; both decisions stay in the history');

  sec('8. Search and filters; other employees unaffected');
  const list = (qs) => call('GET', `/employees?${qs}`, null, T.hrm).then((x) => x.d);
  ok((await list(`employment_type=probation&department_id=${dep}&hired_from=${addD(TODAY, -60)}&hired_to=${TODAY}`)).some((x) => x.id === A.id), 'filter by department, employment type and start date'); ok((await list('probation_status=on_probation')).some((x) => x.id === A.id) && !(await list('probation_status=on_probation')).some((x) => x.id === B.id), 'filter: on probation'); ok((await list('probation_status=confirmed')).some((x) => x.id === B.id), 'filter: confirmed'); ok((await list('probation_status=awaiting_decision')).every((x) => x.employment_type === 'probation'), 'filter: awaiting decision');
  const al = (await list('q=Prb')).find((x) => x.id === A.id); ok(al.probation_days_left > 100, 'the list shows the remaining days');
  ok(Number((await pool.query("SELECT count(*) FROM permanent_reviews r JOIN employees e ON e.id=r.employee_id WHERE e.employment_type='permanent' AND r.status='pending'")).rows[0].count) === 0, 'no permanent employee has an open review');

  sec('9. Months setting');
  ok((await call('PUT', '/settings', { probation_months: 0 }, T.admin)).s === 400 && (await call('PUT', '/settings', { probation_months: 3 }, T.admin)).s === 200, 'the probation length is configurable (1-24 months)');
  const E3 = await mk({ hire_date: '2026-01-31' }); ok(String(E3.probation_end).slice(0, 10) === '2026-04-30', 'a 3-month rule gives 31 Jan + 3 months = 30 Apr'); await call('PUT', '/settings', { probation_months: 6 }, T.admin);
  ok(String((await get(A.id)).probation_end).slice(0, 10) === P.addMonths(addD(TODAY, -45), 6), 'changing the setting does not move the date of employees already registered');

  await pool.query("UPDATE settings SET value='1' WHERE key='probation_auto_permanent'"); console.log(`\n${pass} passed, ${fail} failed`); srv.close(); await pool.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
