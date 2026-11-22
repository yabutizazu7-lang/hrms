// Work Experience Certificate: the whole process against the real API and a DEVELOPMENT database (creates real records).
// Run: npm run db:init && npm run seed:all && npm run test:certificates
require('../src/env'); process.env.RATE_LIMIT_MULT = '50';
const fs = require('fs'), path = require('path'), app = require('../src/index'), { pool } = require('../src/db');
const PW = process.env.SEED_PASSWORD || 'Dev@12345678', ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../uploads'));
let base, pass = 0, fail = 0, LAST;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m, process.env.DEBUG ? JSON.stringify(LAST).slice(0, 300) : ''); } };
const call = async (method, p, body, token) => { const r = await fetch(base + '/api' + p, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) }); const d = r.status === 204 ? {} : await r.json().catch(() => ({})); LAST = { method, p, s: r.status, d }; return { s: r.status, d }; };
const raw = async (p, token) => { const r = await fetch(base + '/api' + p, { headers: { Authorization: 'Bearer ' + token } }); return { s: r.status, buf: Buffer.from(await r.arrayBuffer()), h: r.headers }; };
const login = async (u) => (await call('POST', '/login', { email: `${u}@hrms.test`, password: PW })).d.token;
const sec = (t) => console.log('\n' + t), blocked = async (sql, a = []) => { try { await pool.query(sql, a); return false; } catch { return true; } };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
(async () => {
  const srv = app.listen(0); base = `http://127.0.0.1:${srv.address().port}`;
  const T = {}; for (const u of ['hrm', 'hro', 'emp', 'emp2', 'exec', 'superadmin', 'sup']) T[u] = await login(u);
  const emps = (await call('GET', '/employees?status=all', null, T.hrm)).d, E = {}; for (const e of emps) if (e.email && e.email.endsWith('@hrms.test')) E[e.email.split('@')[0]] = e;
  const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Addis_Ababa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()), emp = E.emp;
  // clean slate for this employee (a previous run): certificates and recommendation cases are permanent records, so use a NEW employee each run
  const tag = Date.now().toString(36).toUpperCase(), LK = (await call('GET', '/lookups', null, T.hrm)).d;
  const mk = await call('POST', '/employees', { first_name: 'Cert' + tag, father_name: 'Test', grandfather_name: 'Person', sex: 'female', hire_date: '2021-02-01', department_id: LK.departments[0].id, position_id: LK.positions[0].id, basic_salary: LK.positions[0].min_salary || 0, email: `cert${tag.toLowerCase()}@hrms.test` }, T.hrm);
  ok(mk.s === 201, 'test employee registered ' + JSON.stringify(mk.d).slice(0, 120)); const e = mk.d;
  await pool.query("INSERT INTO users(name,email,password_hash,role,employee_id) VALUES($1,$2,$3,'employee',$4)", [e.full_name, e.email, require('bcryptjs').hashSync('Test#Pass12345', 10), e.id]);
  const TE = (await call('POST', '/login', { email: e.email, password: 'Test#Pass12345' })).d.token; ok(TE, 'the employee signs in');

  sec('1. The certificate is not enabled before a Recommendation Letter is issued');
  ok((await call('POST', '/work-certificates', { employee_id: e.id }, T.hro)).s === 409, 'no Recommendation Letter -> 409');
  ok(!(await call('GET', '/work-certificates/employees?q=Cert' + tag, null, T.hro)).d.rows.length, 'employee is not in the list yet');

  sec('2. Recommendation Letter workflow (employee request -> HR -> issued)');
  const types = (await call('GET', '/hr-cases/types', null, T.hrm)).d; ok(types.some((t) => t.type === 'recommendation_letter'), 'case type exists');
  const nc = await call('POST', '/hr-cases', { case_type: 'recommendation_letter', employee_id: e.id, reason: 'Needed for a new job', data: { purpose: 'Job application' } }, T.hro); ok(nc.s === 201, 'HR opens the request');
  const id = nc.d.id, act = (t, a, body = {}) => call('POST', `/hr-cases/${id}/action`, { action: a, ...body }, t);
  ok((await act(T.hro, 'submit')).s === 200, 'submitted'); ok((await act(T.hro, 'review')).s === 200, 'review');
  ok((await call('POST', '/work-certificates', { employee_id: e.id }, T.hro)).s === 409, 'still not enabled before the recommendation is given');
  ok((await act(T.hro, 'recommend', { note: 'Recommended' })).s === 200, 'recommendation (ምክረ ሐሳብ) given');
  const auto = (await call('GET', '/work-certificates?status=draft&q=Cert' + tag, null, T.hro)).d; ok(auto.total === 1, 'the certificate draft is prepared AUTOMATICALLY when the recommendation is given');
  ok((await act(T.hrm, 'decide', { decision: 'approved', reason: 'Approved', effective_date: TODAY })).s === 200, 'HR manager approves');
  const done = await act(T.hrm, 'complete'); ok(done.s === 200 && done.d.stage === 'completed', 'Recommendation Letter completed');
  const lst = (await call('GET', '/work-certificates/employees?q=Cert' + tag, null, T.hro)).d.rows; ok(lst.length === 1 && lst[0].enabled === true && lst[0].recommendation_stage === 'completed' && lst[0].certificate_status === 'draft', 'employee listed, ENABLED, draft present');
  ok((await call('GET', '/work-certificates/employees?state=draft&q=Cert' + tag, null, T.hro)).d.total === 1, 'filter "draft"');

  sec('3. Permissions');
  for (const [n, t] of [['employee', TE], ['executive', T.exec], ['super admin', T.superadmin]]) { ok((await call('POST', '/work-certificates', { employee_id: e.id }, t)).s === 403, n + ' cannot prepare a certificate'); ok((await call('GET', '/work-certificates/employees', null, t)).s === 403, n + ' cannot list eligible employees'); }

  sec('4. Draft, preview, edit');
  const g = { s: 201, d: (await call('GET', `/work-certificates/${auto.rows[0].id}`, null, T.hro)).d }; ok(g.s === 201 && g.d.status === 'draft' && /^WEC-\d{4}-\d{5}$/.test(g.d.ref_no), 'draft prepared ' + g.d.ref_no);
  const cid = g.d.id, s0 = g.d.snapshot; ok(s0.employee.employee_no === e.employee_no && s0.employment.start_date === '2021-02-01' && s0.employment.service.years >= 5 && s0.recommendation.ref_no === nc.d.ref_no, 'data comes from the database (' + JSON.stringify(s0.employment.service) + ')');
  ok((await call('POST', '/work-certificates', { employee_id: e.id }, T.hro)).s === 409, 'a second draft is refused');
  ok((await call('GET', `/work-certificates/${cid}`, null, TE)).s === 404, 'the employee cannot see a draft');
  const pv = await raw(`/work-certificates/${cid}/pdf`, T.hro); ok(pv.s === 200 && pv.buf.slice(0, 4).toString() === '%PDF' && /pdf/.test(pv.h.get('content-type')), 'preview PDF is a real PDF');
  ok((await raw(`/work-certificates/${cid}/pdf`, TE)).s === 404, 'employee cannot open the draft PDF');
  ok((await call('PUT', `/work-certificates/${cid}`, { responsibilities: 'a\n'.repeat(11), language: 'am' }, T.hro)).s === 400, 'more than 10 responsibilities refused');
  const ed = await call('PUT', `/work-certificates/${cid}`, { language: 'am', responsibilities: 'Teaching\nCurriculum work' }, T.hro); ok(ed.s === 200 && ed.d.language === 'am' && ed.d.snapshot.responsibilities === 'Teaching\nCurriculum work', 'draft edited');
  ok((await call('POST', `/work-certificates/${cid}/refresh`, {}, T.hro)).s === 200, 'refresh data');

  sec('5. Approval: only the HR authority');
  ok((await call('POST', `/work-certificates/${cid}/issue`, {}, T.hro)).s === 403, 'HR officer cannot issue');
  ok((await call('POST', `/work-certificates/${cid}/issue`, {}, TE)).s === 403, 'employee cannot issue');
  ok((await call('POST', `/work-certificates/${cid}/issue`, {}, T.superadmin)).s === 403, 'super admin cannot issue');
  ok((await call('POST', '/work-certificates/assets', { kind: 'stamp', filename: 'stamp.png', mime: 'image/png', data: PNG.toString('base64') }, T.hro)).s === 403, 'HR officer cannot upload the stamp');
  ok((await call('POST', '/work-certificates/assets', { kind: 'stamp', filename: 'x.exe', mime: 'application/x-msdownload', data: 'AAAA' }, T.hrm)).s === 400, 'non-image refused');
  ok((await call('POST', '/work-certificates/assets', { kind: 'stamp', filename: 'stamp.png', mime: 'image/png', data: PNG.toString('base64') }, T.hrm)).s === 201, 'stamp uploaded by HR manager');
  ok((await call('POST', '/work-certificates/assets', { kind: 'signature', filename: 'sig.png', mime: 'image/png', data: PNG.toString('base64') }, T.hrm)).s === 201, 'signature uploaded by HR manager');
  const as = (await call('GET', '/work-certificates/assets', null, T.hro)).d; ok(as.stamp && as.stamp.data_url.startsWith('data:image/png') && as.signature === null && as.can_upload === false, 'HR officer sees the stamp, not another person\'s signature');
  const iss = await call('POST', `/work-certificates/${cid}/issue`, {}, T.hrm); ok(iss.s === 200 && iss.d.status === 'issued' && iss.d.issue_date === TODAY && iss.d.approved_by_name && iss.d.pdf_sha256 && iss.d.pdf_sha256.length === 64, 'HR manager approved and issued');
  ok((await call('PUT', `/work-certificates/${cid}`, { language: 'en' }, T.hrm)).s === 409, 'issued certificate cannot be edited');
  ok(await blocked("UPDATE work_certificates SET issue_date='2000-01-01' WHERE id=$1", [cid]), 'database refuses to change an issued certificate');
  ok(await blocked('DELETE FROM work_certificates WHERE id=$1', [cid]), 'database refuses to delete a certificate'); ok(await blocked("UPDATE work_certificate_events SET note='x'"), 'history is append-only');

  sec('6. PDF, employee profile');
  const pdf = await raw(`/work-certificates/${cid}/pdf?download=1`, T.hrm); ok(pdf.s === 200 && pdf.buf.slice(0, 4).toString() === '%PDF' && /attachment/.test(pdf.h.get('content-disposition')) && pdf.buf.length > 20000, 'issued PDF downloads (' + pdf.buf.length + ' bytes)');
  fs.writeFileSync('/tmp/issued_test.pdf', pdf.buf);
  ok((await raw(`/work-certificates/${cid}/pdf`, TE)).s === 200, 'the employee downloads their own certificate');
  ok((await raw(`/work-certificates/${cid}/pdf`, T.emp)).s === 404, 'another employee gets 404');
  const mine = (await call('GET', '/work-certificates', null, TE)).d; ok(mine.rows.length === 1 && mine.rows[0].status === 'issued', 'employee list shows only their issued certificate');
  const docs = (await call('GET', `/employees/${e.id}/documents`, null, TE)).d; ok(docs.some((d) => d.doc_type === 'certificate' && /Work Experience Certificate/.test(d.title)), 'saved in the employee personnel file');
  const prof = (await call('GET', `/employees/${e.id}`, null, T.hrm)).d; ok(prof.history.some((h) => /certificate issued/i.test(h.note || '')), 'recorded in the employee history');
  const ev = (await call('GET', `/work-certificates/${cid}`, null, T.hrm)).d.events.map((x) => x.action); ok(['generated', 'edited', 'refreshed', 'issued'].every((a) => ev.includes(a)), 'certificate history: ' + ev.join(','));
  ok((await pool.query("SELECT count(*)::int n FROM notifications WHERE subject LIKE $1", ['%' + g.d.ref_no + '%'])).rows[0].n === 1, 'the employee was notified');

  sec('7. No duplicate issuance');
  ok((await call('POST', '/work-certificates', { employee_id: e.id }, T.hro)).s === 409, 'HR officer: duplicate refused');
  ok((await call('POST', '/work-certificates', { employee_id: e.id }, T.hrm)).s === 409, 'HR manager without confirmation: refused');
  ok((await call('POST', '/work-certificates', { employee_id: e.id, reissue: true }, T.hrm)).s === 400, 'a reason is required');
  const g2 = await call('POST', '/work-certificates', { employee_id: e.id, reissue: true, reissue_reason: 'Position title corrected' }, T.hrm); ok(g2.s === 201 && g2.d.supersedes_id === cid, 'authorized HR manager prepares another one');
  ok((await call('POST', `/work-certificates/${g2.d.id}/issue`, {}, T.hrm)).s === 200, 'second certificate issued');
  const old = (await call('GET', `/work-certificates/${cid}`, null, T.hrm)).d; ok(old.status === 'superseded', 'the first one is kept as superseded');
  ok((await pool.query("SELECT count(*)::int n FROM work_certificates WHERE employee_id=$1 AND status='issued'", [e.id])).rows[0].n === 1, 'exactly one issued certificate');
  ok((await call('GET', '/work-certificates', null, TE)).d.rows.length === 1, 'employee sees only the valid certificate');

  sec('8. Records: search, filter, cancel, integrity');
  const all = (await call('GET', '/work-certificates?q=Cert' + tag, null, T.hro)).d; ok(all.total === 2, 'search by name finds both records');
  ok((await call('GET', '/work-certificates?status=issued&q=Cert' + tag, null, T.hro)).d.total === 1, 'filter by status'); ok((await call('GET', `/work-certificates?from=${TODAY}&to=${TODAY}&q=Cert${tag}`, null, T.hro)).d.total === 2, 'filter by date');
  ok((await call('GET', '/work-certificates?status=bogus', null, T.hro)).s === 400, 'bad filter refused'); ok((await call('GET', '/work-certificates', null, T.exec)).d.rows.length === 0, 'executive sees no certificates');
  const row = (await pool.query('SELECT employee_id,pdf_storage FROM work_certificates WHERE id=$1', [g2.d.id])).rows[0], fp = path.join(ROOT, 'emp', String(row.employee_id), row.pdf_storage); fs.appendFileSync(fp, 'x');
  ok((await raw(`/work-certificates/${g2.d.id}/pdf`, T.hrm)).s === 500, 'a tampered PDF is detected');
  ok((await call('POST', `/work-certificates/${g2.d.id}/cancel`, {}, T.hrm)).s === 400, 'cancel needs a reason'); ok((await call('POST', `/work-certificates/${g2.d.id}/cancel`, { reason: 'x' }, T.hro)).s === 403, 'officer cannot cancel an issued certificate');
  ok((await call('POST', `/work-certificates/${g2.d.id}/cancel`, { reason: 'Issued by mistake' }, T.hrm)).d.status === 'cancelled', 'HR manager cancels it (kept in history)');
  const g3 = await call('POST', '/work-certificates', { employee_id: e.id }, T.hro); ok(g3.s === 201, 'a new certificate can be prepared after cancellation'); ok((await call('POST', `/work-certificates/${g3.d.id}/cancel`, { reason: 'Not needed' }, T.hro)).d.status === 'cancelled', 'officer discards a draft');

  sec('9. A Work-experience certificate request (case type experience_certificate): enabled when the recommendation is given');
  const mk2 = await call('POST', '/employees', { first_name: 'Exp' + tag, father_name: 'Test', grandfather_name: 'Person', sex: 'male', hire_date: '2019-02-01', department_id: LK.departments[0].id, position_id: LK.positions[0].id, basic_salary: LK.positions[0].min_salary || 0, email: `exp${tag.toLowerCase()}@hrms.test` }, T.hrm); ok(mk2.s === 201, 'second test employee'); const x2 = mk2.d;
  const ex = await call('POST', '/hr-cases', { case_type: 'experience_certificate', employee_id: x2.id, reason: 'Needed for a new job', data: { purpose: 'Job application' } }, T.hro); ok(ex.s === 201, 'experience certificate request opened');
  const xact = (t, a, body = {}) => call('POST', `/hr-cases/${ex.d.id}/action`, { action: a, ...body }, t);
  ok((await xact(T.hro, 'submit')).s === 200 && (await xact(T.hro, 'review')).s === 200, 'submitted and under review');
  ok(!(await call('GET', '/work-certificates/employees?q=Exp' + tag, null, T.hro)).d.rows.some((x) => x.enabled), 'not enabled before the recommendation');
  ok((await xact(T.hro, 'recommend', { note: 'Recommended' })).s === 200, 'recommendation (ምክረ ሐሳብ) given');
  const l2 = (await call('GET', '/work-certificates/employees?q=Exp' + tag, null, T.hro)).d.rows; ok(l2.length === 1 && l2[0].enabled === true && l2[0].certificate_status === 'draft', 'the employee is ENABLED and the draft is prepared');
  const dr = (await call('GET', '/work-certificates?status=draft&q=Exp' + tag, null, T.hro)).d.rows[0]; ok(dr && (await raw(`/work-certificates/${dr.id}/pdf`, T.hro)).buf.slice(0, 4).toString() === '%PDF', 'the draft previews as a PDF');
  ok((await call('POST', `/work-certificates/${dr.id}/cancel`, { reason: 'test' }, T.hro)).s === 200, 'draft discarded');
  const l3 = (await call('GET', '/work-certificates/employees?q=Exp' + tag, null, T.hro)).d.rows; ok(l3[0].certificate_status === 'draft' && l3[0].certificate_id !== dr.id, 'opening the list prepares the draft again for an already-recommended request');
  const iss2 = await call('POST', `/work-certificates/${l3[0].certificate_id}/issue`, {}, T.hrm); ok(iss2.s === 200 && iss2.d.status === 'issued', 'HR Manager issues it');
  const pdf2 = await raw(`/work-certificates/${iss2.d.id}/pdf?download=1`, T.hrm); ok(pdf2.s === 200 && pdf2.buf.slice(0, 4).toString() === '%PDF', 'download works');
  console.log(`\n${pass} passed, ${fail} failed`); srv.close(); await pool.end(); process.exit(fail ? 1 : 0);
})().catch((x) => { console.error(x); process.exit(1); });
