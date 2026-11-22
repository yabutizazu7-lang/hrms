// Retirement management (ጡረታ): overview of every employee by retirement status, detail, start of the retirement process, the retirement letter (PDF).
// Eligibility is decided here from employees.date_of_birth (see ../retirement.js). The approval itself stays in the existing HR case workflow (case type 'retirement'):
// HR reviews and recommends, the HR Manager (cases.decide_hr) decides and records the official retirement date, then completes it (which opens the existing separation).
const express = require('express'), { q, tx } = require('../db'), { perm, has, audit, wrap, bad } = require('../mw'), U = require('../util'), H = require('../hr'), F = require('../files'), S = require('../service');
const R = require('../retirement'), PDF = require('../retirement-pdf'), { helpers: CH } = require('./cases'), E = require('./employees');
const r = express.Router(), LANGS = ['am'];   // the letter is issued in Amharic only
const isHR = (req) => req.user.role !== 'super_admin' && has(req, 'cases.manage');
const SORTS = { age: (a) => a.age, retirement_date: (a) => a.retirement_eligibility_date, name: (a) => a.full_name.toLowerCase(), department: (a) => (a.department || '').toLowerCase(), official: (a) => a.official_retirement_date || '' };
const view = (x) => x;

r.get('/retirement/overview', perm('cases.manage', 'cases.view'), wrap(async (req, res) => {
  const { retAge, today, rows, missingDob } = await R.everyone(); if (retAge == null) return res.json({ configured: false });
  const stats = { ...R.counts(rows), missing_date_of_birth: missingDob };
  const status = String(req.query.status || 'attention'); if (!['attention', 'all', ...R.STATUSES].includes(status)) throw bad('Status is not valid');
  let list = rows.filter((x) => (status === 'all' ? true : status === 'attention' ? x.status === 'approaching' || x.status === 'eligible' : x.status === status));
  if (req.query.department_id) { const d = U.int(req.query.department_id, 'Department'); list = list.filter((x) => x.department_id === d); }
  if (req.query.q) { const t = String(req.query.q).trim().toLowerCase().slice(0, 60); list = list.filter((x) => x.full_name.toLowerCase().includes(t) || x.employee_no.toLowerCase().includes(t)); }
  const sort = SORTS[req.query.sort] ? req.query.sort : status === 'completed' ? 'official' : 'retirement_date', dir = req.query.dir === 'desc' ? -1 : 1, key = SORTS[sort];
  list.sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : a.full_name.localeCompare(b.full_name)) * dir);
  const page = Math.max(1, U.int(req.query.page || 1, 'Page')), size = Math.min(100, Math.max(1, U.int(req.query.page_size || 25, 'Page size')));
  res.json({ configured: true, retirement_age: retAge, today, stats, total: list.length, page, page_size: size, rows: list.slice((page - 1) * size, page * size).map(view) });
}));

// ---- one employee: all retirement information in one place --------------------------------------------------------------------------------------------------
const detail = async (req, id) => {
  const all = await R.everyone({ query: q }, id), x = all.rows[0]; if (all.retAge == null) throw bad('The retirement age is not configured', 409); if (!x) throw bad('Employee not found, or the employee has no date of birth', 404);
  const e = U.needRow((await q('SELECT e.*,d.name AS dept FROM employees e LEFT JOIN departments d ON d.id=e.department_id WHERE e.id=$1', [id])).rows[0], 'Employee');
  const periods = (await q('SELECT * FROM service_periods WHERE employee_id=$1', [id])).rows, svc = S.experience({ hire_date: e.hire_date, termination_date: e.termination_date }, periods, all.today);
  const cases = (await q("SELECT c.id,c.ref_no,c.stage,c.decision,c.effective_date,c.decision_reason,c.data,c.created_at,c.completed_at,u.name AS initiated_by_name,du.name AS decided_by_name,c.decided_at FROM hr_cases c LEFT JOIN users u ON u.id=c.initiated_by LEFT JOIN users du ON du.id=c.decided_by WHERE c.employee_id=$1 AND c.case_type='retirement' ORDER BY c.id DESC", [id])).rows;
  const events = cases.length ? (await q('SELECT v.*,u.name AS by_name FROM hr_case_events v LEFT JOIN users u ON u.id=v.by_user WHERE v.case_id = ANY($1) ORDER BY v.id', [cases.map((c) => c.id)])).rows : [];
  const milestones = (await q('SELECT milestone,reached_on,retirement_age,raised_at,notified_at FROM retirement_milestones WHERE employee_id=$1 ORDER BY id', [id])).rows;
  const approved = cases.find((c) => c.decision === 'approved' && c.stage !== 'cancelled') || null, letter = approved ? (await q('SELECT id,ref_no,language,issued_at,document_id FROM retirement_letters WHERE case_id=$1', [approved.id])).rows[0] || null : null;
  const hr = isHR(req);
  return { ...x, retirement_age: all.retAge, today: all.today, gender: x.sex, service: { years: svc.current.years, months: svc.current.months, days: svc.current.days }, cases, events, milestones, letter, approved_case: approved,
    actions: { initiate: hr && x.status === 'eligible' && !x.open_case_id, letter: hr && !!approved && ['approved', 'completed'].includes(approved.stage) && !!approved.effective_date && !letter, open_case: !!x.open_case_id || !!approved } };
};
r.get('/retirement/employees/:id', perm('cases.manage', 'cases.view'), wrap(async (req, res) => res.json(await detail(req, U.int(req.params.id, 'Employee', true)))));

// ---- start the retirement process (only for an employee who has reached the retirement age) -----------------------------------------------------------------------
r.post('/retirement/employees/:id/initiate', perm('cases.manage'), wrap(async (req, res) => {
  const id = U.int(req.params.id, 'Employee', true), remarks = U.str(req.body.remarks, { max: 1000, name: 'Remarks' });
  const c = await tx(async (t) => {
    U.needRow((await t.query('SELECT id FROM employees WHERE id=$1 FOR UPDATE', [id])).rows[0], 'Employee');   // serialises two people starting the same process
    if (id === req.user.employee_id) throw bad('You cannot start the retirement process of yourself', 403);
    const all = await R.everyone(t, id), x = all.rows[0]; if (all.retAge == null) throw bad('The retirement age is not configured', 409); if (!x) throw bad('The employee has no date of birth in the employee record. Record it first', 409);
    if (x.status === 'completed') throw bad('The retirement process of this employee is already completed', 409);
    if (x.open_case_id) throw bad(`A retirement process (${x.open_case_ref}) is already open for this employee`, 409);
    if (x.status !== 'eligible') throw bad(`This employee is ${x.age} years old and has not reached the retirement age (${all.retAge}). The retirement process starts on ${x.retirement_eligibility_date}`, 409);
    const data = CH.cleanData('retirement', { retirement_basis: `Reached the retirement age of ${all.retAge} years (date of birth ${x.date_of_birth}, age ${x.age})`, expected_date: x.retirement_eligibility_date, ...(remarks ? { remarks } : {}) });
    const row = (await t.query('INSERT INTO hr_cases(ref_no,case_type,employee_id,initiated_by,reason,data,confidential) VALUES($1,$2,$3,$4,$5,$6,false) RETURNING id', [await CH.ref(t, 'retirement'), 'retirement', id, req.user.id, remarks, data])).rows[0];
    await CH.ev(t, row.id, 'created', null, 'draft', 'Started from the Retirement page: the employee reached the retirement age', req.user.id); return CH.load(t, row.id);
  });
  audit(req, 'create', 'hr_cases', c.id, c.ref_no); res.status(201).json(c);
}));

// ---- the retirement letter (after the HR Manager approved the retirement with the official retirement date) --------------------------------------------------------
r.post('/retirement/employees/:id/letter', perm('cases.manage'), wrap(async (req, res) => {
  const id = U.int(req.params.id, 'Employee', true), language = U.oneOf(req.body.language || 'am', LANGS, 'Language'); let stored = null;
  try {
    const out = await tx(async (t) => {
      U.needRow((await t.query('SELECT id FROM employees WHERE id=$1 FOR UPDATE', [id])).rows[0], 'Employee');
      const c = (await t.query("SELECT c.*,du.name AS decided_by_name,du.job_title AS decided_by_title,du.id AS decider_id,ro.name AS decider_role FROM hr_cases c LEFT JOIN users du ON du.id=c.decided_by LEFT JOIN roles ro ON ro.code=du.role WHERE c.employee_id=$1 AND c.case_type='retirement' AND c.decision='approved' AND c.stage IN ('approved','completed') ORDER BY c.id DESC LIMIT 1 FOR UPDATE OF c", [id])).rows[0];
      if (!c) throw bad('The retirement letter can be issued only after the HR Manager has approved the retirement', 409); if (!c.effective_date) throw bad('The official retirement date is not recorded', 409);
      if ((await t.query('SELECT 1 FROM retirement_letters WHERE case_id=$1', [c.id])).rows[0]) throw bad('The retirement letter for this case has already been issued. Download it from the retirement record', 409);
      const e = U.needRow((await t.query('SELECT e.*,pos.title AS pos_title,d.name AS dept_name FROM employees e LEFT JOIN positions pos ON pos.id=e.position_id LEFT JOIN departments d ON d.id=e.department_id WHERE e.id=$1', [id])).rows[0], 'Employee'); if (!e.date_of_birth) throw bad('The employee has no date of birth', 409);
      const retAge = await R.retirementAge(), today = await R.localToday(), official = H.iso(c.effective_date), st = await H.settings();
      const svc = S.experience({ hire_date: e.hire_date, termination_date: official < today ? official : null }, (await t.query('SELECT * FROM service_periods WHERE employee_id=$1', [id])).rows, official < today ? official : today);
      const snap = { organization: { name: st.org_name, name_am: st.org_name_am || null }, employee: { id: e.id, employee_no: e.employee_no, full_name: e.full_name, name_am: e.full_name_am || null, name_en: e.full_name_en || null, sex: e.sex, date_of_birth: H.iso(e.date_of_birth) },
        job: { title: e.pos_title || e.jeg_title || null, title_am: e.jeg_title || null, department: e.dept_name || null }, employment: { start_date: H.iso(e.hire_date), service: { years: svc.current.years, months: svc.current.months } },
        retirement: { age: retAge || R.ageOn(H.iso(e.date_of_birth), official), official_date: official, remarks: (c.data && c.data.remarks) || null, case_ref: c.ref_no, decided_on: c.decided_at ? H.iso(c.decided_at) : null } };
      const title = c.decided_by_title || c.decider_role || null, sigRow = c.decider_id ? (await t.query("SELECT * FROM certificate_assets WHERE kind='signature' AND active AND user_id=$1", [c.decider_id])).rows[0] : null, stRow = (await t.query("SELECT * FROM certificate_assets WHERE kind='stamp' AND active")).rows[0];
      const img = (a) => { if (!a) return null; try { const b = F.read('cert-assets', a.storage_name); return U.sha256(b) === a.sha256 ? b : null; } catch { return null; } };
      const refNo = `RTL-${new Date().getFullYear()}-${U.pad(await U.nextNo(t, 'rtl-' + new Date().getFullYear()), 5)}`;
      const pdf = await PDF.build({ snap, ref: refNo, issueDate: today, approver: { name: (await H.settings()).hr_manager_name || c.decided_by_name, title }, signature: img(sigRow), stamp: img(stRow), language });
      stored = F.save('emp/' + id, { data: pdf.toString('base64'), mime: 'application/pdf', filename: `Retirement-Letter-${refNo}.pdf` }, ['application/pdf']);
      const doc = (await t.query("INSERT INTO employee_documents(employee_id,doc_type,title,filename,mime,size_bytes,sha256,storage_name,confidential,uploaded_by) VALUES($1,'certificate',$2,$3,'application/pdf',$4,$5,$6,false,$7) RETURNING id", [id, `Retirement Letter ${refNo}`, stored.filename, stored.size, stored.sha256, stored.storage, req.user.id])).rows[0];
      const L = (await t.query('INSERT INTO retirement_letters(case_id,employee_id,ref_no,language,snapshot,issued_by,pdf_storage,pdf_sha256,pdf_size,document_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *', [c.id, id, refNo, language, snap, req.user.id, stored.storage, stored.sha256, stored.size, doc.id])).rows[0];
      await E.hist(t, id, 'note', null, refNo, `Retirement letter issued (official retirement date ${official})`, req.user.id, today); return L;
    });
    audit(req, 'issue', 'retirement_letters', out.id, out.ref_no); const { pdf_storage, snapshot, ...o } = out; res.status(201).json(o);
  } catch (e) { if (stored) F.remove('emp/' + id, stored.storage); throw e; }
}));
r.get('/retirement/letters/:id/pdf', perm(), wrap(async (req, res) => {
  const l = U.needRow((await q('SELECT l.*,c.stage FROM retirement_letters l JOIN hr_cases c ON c.id=l.case_id WHERE l.id=$1', [Number(req.params.id) || 0])).rows[0], 'Letter');
  if (!(isHR(req) || (req.user.employee_id && l.employee_id === req.user.employee_id && l.stage === 'completed'))) throw bad('Letter not found', 404);
  const buf = F.read('emp/' + l.employee_id, l.pdf_storage); if (U.sha256(buf) !== l.pdf_sha256) { audit(req, 'integrity_failure', 'retirement_letters', l.id); throw bad('The integrity check of this file failed. It may have been altered. Tell the system administrator', 500); }
  audit(req, 'download', 'retirement_letters', l.id, l.ref_no);
  res.set({ 'Content-Type': 'application/pdf', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Content-Disposition': `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="Retirement-Letter-${l.ref_no}.pdf"` }).send(buf);
}));

// run the age check and the notification now (the same code the server runs every 6 hours); safe to repeat: nothing is sent twice
r.post('/retirement/check', perm('cases.decide_hr'), wrap(async (req, res) => { const o = await R.runCheck(); audit(req, 'run', 'retirement_check', null, JSON.stringify(o)); res.json(o); }));
module.exports = { router: r };
