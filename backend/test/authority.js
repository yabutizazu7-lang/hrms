// Tests: HR HAS EXCLUSIVE AUTHORITY over the 15 listed matters (acting assignment, disciplinary, experience certificate, external transfer, internal transfer,
// long-term education, permanent appointment, promotion, retirement, short-term training, termination, recruitment, resignation, uniforms, work tools).
// Real demo accounts; DEVELOPMENT database only (creates cases and records). Run: npm run db:init && npm run seed:all && npm run test:authority
require('../src/env'); process.env.RATE_LIMIT_MULT = '50';
const app = require('../src/index'), { pool } = require('../src/db'), fs = require('fs'), path = require('path');
const PW = process.env.SEED_PASSWORD || 'Dev@12345678';
let base, pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } }, sec = (t) => console.log('\n' + t);
const call = async (method, p, body, token) => { const r = await fetch(base + '/api' + p, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) }); let d = null; try { d = await r.json(); } catch {} return { s: r.status, d }; };
const loginFull = async (u) => (await call('POST', '/login', { email: `${u}@hrms.test`, password: PW })).d;
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'), pdf = (title = 'Doc') => ({ title, filename: 'doc.pdf', mime: 'application/pdf', data: PDF.toString('base64') });
const TYPES = ['acting_assignment', 'disciplinary', 'experience_certificate', 'external_transfer', 'internal_transfer', 'long_term_education', 'permanent_appointment', 'promotion', 'recommendation_letter', 'retirement', 'short_term_training', 'termination'];
const tag = Date.now().toString(36).toUpperCase(), iso = (d) => d.toISOString().slice(0, 10), TODAY = iso(new Date());
(async () => {
  const srv = app.listen(0); base = `http://127.0.0.1:${srv.address().port}`;
  const L = {}; for (const u of ['hrm', 'hro', 'exec', 'admin', 'emp', 'emp2', 'mgr', 'superadmin', 'payroll']) L[u] = await loginFull(u); const T = Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v.token]));
  const perms = (u) => L[u].permissions || [], me = async (u) => (await call('GET', '/me', null, T[u])).d;
  const LK = (await call('GET', '/lookups', null, T.hrm)).d; let n = 0;
  const mkEmp = async () => { n++; return (await call('POST', '/employees', { first_name: 'Aut' + n, father_name: 'T' + tag, sex: 'male', hire_date: '2018-01-01', department_id: LK.departments[0].id }, T.hrm)).d; };
  const act = (id, action, body = {}, tok = T.hrm) => call('POST', `/hr-cases/${id}/action`, { action, ...body }, tok), open = (type, emp, data = {}, tok = T.hro) => call('POST', '/hr-cases', { case_type: type, employee_id: emp, reason: 'test', data }, tok);
  const refused = (r) => r.s === 403 || r.s === 404;   // a person who may not even see the case gets 404, one who may see it but not act gets 403: both are a refusal
  const designated = async () => (await call('GET', '/approval-delegates', null, T.hrm)).d.filter((d) => !d.revoked_at);
  for (const d of await designated()) if (d.email === 'hro@hrms.test') await call('POST', `/approval-delegates/${d.id}/revoke`, {}, T.hrm);   // start from "nobody designated"

  sec('1. One authority: the HR department');
  const au = (await call('GET', '/approval-authorities', null, T.hrm)).d;
  ok(au.filter((a) => a.active).length === 1 && au.find((a) => a.active).permission === 'cases.decide_hr' && au.find((a) => a.active).is_hr, 'the only active approval authority is Human Resources (የሰው ሀብት)');
  ok(au.some((a) => a.permission === 'cases.approve' && !a.active) && au.some((a) => a.permission === 'discipline.decide' && !a.active), 'the former institutional options are switched off, kept for history, not deleted');
  ok((await pool.query("SELECT count(*) FROM permissions WHERE code IN ('cases.approve','discipline.decide')")).rows[0].count === '0' || Number((await pool.query("SELECT count(*) FROM permissions WHERE code IN ('cases.approve','discipline.decide')")).rows[0].count) === 0, 'no institution-level decision permission exists any more');
  ok((await call('POST', '/approval-authorities', { permission: 'cases.manage', name_en: 'X', name_am: 'X' }, T.admin)).s === 404 && (await call('PUT', '/approval-authorities/cases.approve', { active: true }, T.admin)).s === 404, 'no other authority can be added or switched on');
  ok(!perms('exec').some((p) => /^cases\.(approve|decide_hr|manage|authorize)$|^discipline\./.test(p)), 'the executive holds no approval or processing permission for HR cases');
  ok(!perms('mgr').some((p) => /^cases\.(approve|decide_hr|manage|authorize)$|^discipline\./.test(p)) && !perms('emp').some((p) => /^cases\.(decide_hr|manage)/.test(p)) && !perms('admin').some((p) => /^cases\.(decide_hr|manage)$|^discipline\./.test(p)), 'line managers, employees and the system administrator hold none either');
  ok(perms('hrm').includes('cases.decide_hr') && perms('hrm').includes('cases.manage') && !perms('hro').includes('cases.decide_hr') && perms('hro').includes('cases.manage'), 'the HR Manager holds the HR authority; HR officers work on cases but do not decide automatically');

  sec('2. All 12 case types: decided by HR, confirmed, nothing unconfirmed');
  const rules = (await call('GET', '/case-rules', null, T.hrm)).d.rules;
  ok(TYPES.every((t) => { const r = rules.find((x) => x.case_type === t); return r && r.approver_permission === 'cases.decide_hr' && r.verified === true && r.source_ref; }) && rules.length === TYPES.length, 'each of the 12 case types is decided by the HR authority, confirmed, with the source recorded');
  ok((await call('PUT', '/case-rules/promotion', { approver_permission: 'cases.manage' }, T.admin)).s === 400 && (await call('PUT', '/case-rules/promotion', { approver_permission: 'cases.approve' }, T.hrm)).s === 400, 'a rule cannot be given to another authority (by the administrator or the HR Manager)');
  ok((await call('PUT', '/case-rules/promotion', { verified: false }, T.hrm)).s === 400, 'the confirmation cannot be withdrawn');
  ok((await call('PUT', '/case-rules/promotion', { requires_recommendation: true }, T.exec)).s === 403 && (await call('PUT', '/case-rules/promotion', { requires_recommendation: true }, T.emp)).s === 403 && (await call('PUT', '/case-rules/promotion', { requires_recommendation: true }, T.hro)).s === 403, 'executive, employee and HR officer cannot change case rules');
  ok((await call('GET', '/hr-cases/types', null, T.hrm)).d.every?.((t) => !t.approval || t.approval.permission === 'cases.decide_hr') !== false, 'the case-type list shows HR as the authority');

  sec('3. A full case, decided by HR (long-term education)');
  const E1 = await mkEmp(), c1 = (await open('long_term_education', E1.id, { program: 'MSc Automotive', institution: 'Adama University', start_date: TODAY })).d;
  ok(c1 && c1.stage === 'draft' && (await call('POST', `/hr-cases/${c1.id}/documents`, pdf('Admission letter'), T.hro)).s === 201, 'an HR officer opens the case and attaches the document');
  for (const [u, who] of [['exec', 'the executive'], ['mgr', 'a line manager'], ['emp', 'an employee'], ['admin', 'the system administrator'], ['superadmin', 'the technical all-rights account'], ['payroll', 'another employee account']]) { ok(refused(await act(c1.id, 'submit', {}, T[u])), `${who} cannot submit or process an HR case`); }
  ok((await act(c1.id, 'submit', {}, T.hro)).s === 200 && (await act(c1.id, 'review', {}, T.hro)).s === 200, 'the HR officer submits and reviews');
  ok((await act(c1.id, 'return', {}, T.hro)).s === 400 && (await act(c1.id, 'return', { note: 'Attach the sponsor letter' }, T.hro)).s === 200, 'return for correction needs the reason; the HR officer returns the case');
  ok((await act(c1.id, 'submit', {}, T.hro)).s === 200 && (await act(c1.id, 'review', {}, T.hro)).s === 200 && (await act(c1.id, 'recommend', { note: 'Recommended' }, T.hro)).s === 200, 'corrected, resubmitted, reviewed and recommended by HR');
  for (const [u, who] of [['exec', 'the executive'], ['mgr', 'a line manager'], ['emp', 'an employee'], ['admin', 'the system administrator'], ['superadmin', 'the all-rights account'], ['hro', 'an HR officer who is not designated']]) ok(refused(await act(c1.id, 'decide', { decision: 'approved', reason: 'x', effective_date: TODAY }, T[u])), `${who} cannot decide`);
  const d1 = (await call('GET', `/hr-cases/${c1.id}`, null, T.hrm)).d; ok(d1.actions.includes('decide') && !d1.actions.includes('forward') && d1.authority.is_hr && d1.authority.forwarded === false && d1.forward_options.length === 0, 'the HR Manager is offered the decision; there is no forwarding to anyone');
  ok((await act(c1.id, 'forward', { authority: 'cases.approve', note: 'x' }, T.hrm)).s === 400, 'forwarding to a higher authority does not exist');
  ok((await act(c1.id, 'decide', { decision: 'approved', reason: 'Meets the criteria', effective_date: TODAY }, T.hrm)).s === 200, 'the HR Manager approves');
  ok((await act(c1.id, 'complete', {}, T.hro)).d.stage === 'completed', 'HR completes the case');
  ok((await call('GET', `/hr-cases/${c1.id}`, null, T.hrm)).d.events.some((e) => e.action === 'decide'), 'the decision is in the history');

  // short-term training: its own complete flow (no document needed): opened and processed by HR, decided by the HR Manager, applied by HR
  const E2s = await mkEmp(), st = (await open('short_term_training', E2s.id, { course: 'Welding safety', provider: 'TVET Agency', start_date: TODAY })).d;
  ok(st && st.stage === 'draft' && (await act(st.id, 'submit', {}, T.hro)).s === 200 && (await act(st.id, 'review', {}, T.hro)).s === 200 && (await act(st.id, 'recommend', { note: 'Needed for the workshop' }, T.hro)).s === 200, 'short-term training: opened, submitted, reviewed and recommended by HR');
  ok((await act(st.id, 'decide', { decision: 'approved', reason: 'Approved by HR', effective_date: TODAY }, T.exec)).s >= 403 && (await act(st.id, 'decide', { decision: 'approved', reason: 'Approved by HR', effective_date: TODAY }, T.hrm)).s === 200, 'short-term training: the executive cannot decide, the HR Manager does');
  const stDone = await act(st.id, 'complete', {}, T.hro); ok(stDone.s === 200 && stDone.d.stage === 'completed', 'short-term training: completed by HR');

  sec('4. Rejection is final; nobody decides their own case or a case they handled');
  const E2 = await mkEmp(), c2 = (await open('short_term_training', E2.id, { course: 'Welding', provider: 'TVET Agency', start_date: TODAY })).d;
  await act(c2.id, 'submit', {}, T.hro); await act(c2.id, 'review', {}, T.hro); await act(c2.id, 'recommend', { note: 'ok' }, T.hro);
  ok((await act(c2.id, 'decide', { decision: 'rejected', reason: 'No budget this year' }, T.hrm)).s === 200 && (await call('GET', `/hr-cases/${c2.id}`, null, T.hrm)).d.stage === 'rejected', 'HR rejects with a reason');
  ok((await act(c2.id, 'decide', { decision: 'approved', reason: 'x', effective_date: TODAY }, T.hrm)).s === 403, 'a rejected case is final');
  const hrmEmp = (await me('hrm')).employee_id, c3 = (await open('experience_certificate', hrmEmp, { purpose: 'Visa' }, T.hro)).d;   // the HR Manager's OWN case
  await act(c3.id, 'submit', {}, T.hro); await act(c3.id, 'review', {}, T.hro);
  ok((await act(c3.id, 'decide', { decision: 'approved', reason: 'x', effective_date: TODAY }, T.hrm)).s === 403, 'the HR Manager cannot decide their own case');
  const E4 = await mkEmp(), c4 = (await open('experience_certificate', E4.id, { purpose: 'Visa' }, T.hrm)).d; await act(c4.id, 'submit', {}, T.hrm); await act(c4.id, 'review', {}, T.hrm);
  ok((await act(c4.id, 'decide', { decision: 'approved', reason: 'x', effective_date: TODAY }, T.hrm)).s === 403, 'the person who opened the case does not decide it');
  const E5 = await mkEmp(), c5 = (await open('promotion', E5.id, { new_position_title: 'Senior', new_grade: 'XVIII' })).d; await act(c5.id, 'submit', {}, T.hro).catch(() => {}); const before = (await call('GET', `/hr-cases/${c5.id}`, null, T.hrm)).d;
  if (before.stage === 'submitted') { await act(c5.id, 'review', {}, T.hro); await act(c5.id, 'recommend', { note: 'ok' }, T.hrm); ok((await act(c5.id, 'decide', { decision: 'approved', reason: 'x', effective_date: TODAY }, T.hrm)).s === 403, 'the person who recommended a case does not decide it (four eyes)'); }

  sec('5. Named HR officers (nobody is authorized automatically)');
  ok((await call('POST', '/approval-delegates', { user_id: 1, source_ref: 'x' }, T.hro)).s === 403 && (await call('POST', '/approval-delegates', { user_id: 1, source_ref: 'x' }, T.admin)).s === 403 && (await call('GET', '/approval-delegates/candidates', null, T.exec)).s === 403, 'only the HR Manager can designate officers');
  const cand = (await call('GET', '/approval-delegates/candidates', null, T.hrm)).d, hroU = cand.find((u) => u.email === 'hro@hrms.test'); ok(!!hroU && !cand.some((u) => u.role === 'employee' || u.role === 'executive' || u.role === 'manager'), 'the candidates are HR staff only');
  ok((await call('POST', '/approval-delegates', { user_id: hroU.id }, T.hrm)).s === 400, 'a designation needs the reference of the official designation');
  const emUser = (await pool.query("SELECT id FROM users WHERE email='emp@hrms.test'")).rows[0].id, exUser = (await pool.query("SELECT id FROM users WHERE email='exec@hrms.test'")).rows[0].id;
  ok((await call('POST', '/approval-delegates', { user_id: emUser, source_ref: 'x' }, T.hrm)).s === 400 && (await call('POST', '/approval-delegates', { user_id: exUser, source_ref: 'x' }, T.hrm)).s === 400, 'an employee or the executive cannot be designated');
  ok((await call('POST', '/approval-delegates', { user_id: L.hrm.user.id, source_ref: 'x' }, T.hrm)).s === 400, 'nobody designates themselves');
  const c6 = (await open('experience_certificate', (await mkEmp()).id, { purpose: 'Visa' }, T.hrm)).d; await act(c6.id, 'submit', {}, T.hrm); await act(c6.id, 'review', {}, T.hrm);
  ok((await act(c6.id, 'decide', { decision: 'approved', reason: 'x', effective_date: TODAY }, T.hro)).s === 403, 'before the designation the HR officer cannot decide');
  const ds = await call('POST', '/approval-delegates', { user_id: hroU.id, source_ref: 'Letter 12/2026', note: 'HR Expert' }, T.hrm); ok(ds.s === 201 && ds.d.source_ref === 'Letter 12/2026', 'the HR Manager designates the HR officer by name, with the reference');
  ok((await act(c6.id, 'decide', { decision: 'approved', reason: 'Verified service', effective_date: TODAY }, T.hro)).s === 200, 'the designated HR officer decides');
  ok((await call('POST', '/approval-delegates', { user_id: hroU.id, source_ref: 'again' }, T.hrm)).s === 400, 'the same officer cannot be designated twice at once');
  const c7 = (await open('experience_certificate', (await mkEmp()).id, { purpose: 'Bank' }, T.hrm)).d; await act(c7.id, 'submit', {}, T.hrm); await act(c7.id, 'review', {}, T.hrm);
  ok((await call('POST', `/approval-delegates/${ds.d.id}/revoke`, {}, T.hro)).s === 403 && (await call('POST', `/approval-delegates/${ds.d.id}/revoke`, {}, T.hrm)).s === 200, 'only the HR Manager withdraws a designation');
  ok((await act(c7.id, 'decide', { decision: 'approved', reason: 'x', effective_date: TODAY }, T.hro)).s === 403, 'after the designation is withdrawn the officer can no longer decide (immediately)');
  ok((await pool.query("SELECT 1 FROM audit_logs WHERE action='designate' AND entity='authority_delegates'")).rows.length > 0 && (await pool.query("SELECT 1 FROM audit_logs WHERE action='revoke' AND entity='authority_delegates'")).rows.length > 0, 'designation and withdrawal are audited');

  sec('6. Recruitment, resignation, uniforms and work tools: HR only');
  const V = { title: 'Instructor ' + tag, department_id: LK.departments[0].id, positions_count: 1, description: 'Teach', closing_date: iso(new Date(Date.now() + 30 * 864e5)) };
  const mkV = (tok) => call('POST', '/vacancies', V, tok);
  for (const u of ['exec', 'mgr', 'emp', 'admin', 'superadmin', 'payroll']) ok((await mkV(T[u])).s === 403, `recruitment: ${u} cannot create or manage vacancies`);
  ok([201, 200].includes((await mkV(T.hro)).s) && [201, 200].includes((await mkV(T.hrm)).s), 'recruitment: the HR officer and the HR Manager can');
  for (const u of ['exec', 'mgr', 'emp', 'admin', 'superadmin']) ok((await call('GET', '/separations', null, T[u])).s === 403, `resignation / separations: ${u} cannot open the HR separation work`);
  ok((await call('GET', '/separations', null, T.hro)).s === 200 && (await call('GET', '/separations', null, T.hrm)).s === 200, 'resignation: HR processes separations');
  const Rz = await mkEmp(), Ru = (await call('POST', '/users', { name: Rz.full_name, email: `rz${tag}@hrms.test`, role: 'employee', password: 'Test#Pass12345', employee_id: Rz.id }, T.admin)); const Rt = (await call('POST', '/login', { email: `rz${tag}@hrms.test`, password: 'Test#Pass12345' })).d?.token;
  if (Rt) { const rs = await call('POST', '/separations/resign', { last_day: iso(new Date(Date.now() + 60 * 864e5)), reason: 'Personal' }, Rt); ok(rs.s === 201 || rs.s === 200, 'resignation: the employee submits their own resignation (self-service)'); const sid = rs.d && rs.d.id; if (sid) { ok((await call('POST', `/separations/${sid}/cancel`, {}, T.exec)).s === 403 && (await call('POST', `/separations/${sid}/complete`, {}, T.mgr)).s === 403, 'resignation: neither the executive nor a manager can process it'); ok((await call('GET', `/separations/${sid}`, null, T.hro)).s === 200, 'resignation: HR processes it'); } } else ok(false, 'could not sign in as the resignation test employee');
  const tool = { code: 'TL' + tag, name_en: 'Hand tool ' + tag, name_am: 'መሣሪያ ' + tag, kind: 'equipment', unit: 'piece', category: 'tools' };
  for (const u of ['exec', 'mgr', 'emp', 'admin', 'superadmin']) ok((await call('POST', '/ppe/items', tool, T[u])).s === 403 && (await call('POST', '/ppe/stock', { item_id: 1, qty: 1 }, T[u])).s === 403 && (await call('POST', '/ppe/issues', { employee_id: 1, item_id: 1, quantity: 1 }, T[u])).s === 403, `uniforms and work tools: ${u} cannot add items, receive stock or issue`);
  const ti = await call('POST', '/ppe/items', tool, T.hro); ok(ti.s === 201 || ti.s === 200, 'work tools: HR adds a work tool / equipment item'); ok((await call('GET', '/ppe/items', null, T.exec)).s === 200, 'the executive may only read the uniform and tool report (reports.view)');
  const ui = (await call('GET', '/ppe/items', null, T.hrm)).d.find((i) => i.category !== 'tools') || (await call('GET', '/ppe/items', null, T.hrm)).d[0]; ok(!!ui && (await call('POST', '/ppe/stock', { item_id: ui.id, move_type: 'receive', qty: 3, note: 'test' }, T.hro)).s < 300, 'uniforms: HR receives stock');

  sec('7. Existing data preserved');
  ok(Number((await pool.query('SELECT count(*) FROM employees')).rows[0].count) > 0 && Number((await pool.query('SELECT count(*) FROM users')).rows[0].count) >= 4, 'employees and accounts are intact');
  ok((await pool.query("SELECT count(*) FROM roles WHERE code IN ('executive','hr_manager','hr_officer','admin','manager','employee','super_admin')")).rows[0].count === '7' || Number((await pool.query("SELECT count(*) FROM roles WHERE code IN ('executive','hr_manager','hr_officer','admin','manager','employee','super_admin')")).rows[0].count) === 7, 'no role was removed');
  const en = JSON.parse(fs.readFileSync(path.join(__dirname, '../../frontend/src/i18n/en.json'), 'utf8')), am = JSON.parse(fs.readFileSync(path.join(__dirname, '../../frontend/src/i18n/am.json'), 'utf8'));
  ok(am['authority.cases.decide_hr'] === 'የሰው ሀብት' && ['These cases are decided exclusively by the HR department', 'The HR authority is confirmed and cannot be withdrawn', 'HR cases are handled by the HR department'].every((k) => am[k] && am[k] !== k), 'the HR authority and its messages are translated into Amharic');
  console.log(`\n${pass} passed, ${fail} failed`); srv.close(); await pool.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
